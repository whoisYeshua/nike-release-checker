// hybridPipeline — API-first checkout pipeline (Story 12.7).
// Orchestrates DOM steps (PDP navigate + size click) with the full API path
// (cart → shipping view → fulfillment → payment → review).
// Each API step is wrapped in withApiRetry for retry-on-403 KPSDK handling.
//
// Feature-flagged: activated when checkout.pipeline === 'hybrid'.
// Story 12.7, FR60-FR66, FR69-FR71.

import type { Page } from 'playwright'
import type { BotConfig } from '../../config/botConfigSchema.ts'
import type { AccountConfig } from '../../config/accountSchema.ts'
import type { Selectors } from '../../config/selectorSchema.ts'
import type { StepResult } from '../executeStep.ts'
import type { FinalOutcome } from '../outcomeClassifier.ts'
import type { CheckoutAddress } from '../api/addressMapper.ts'
import type { CardData } from '../steps/completePayment.ts'
import { maskEmail } from '../../logger/credentialMasker.ts'
import { logStep } from '../../logger/logger.ts'
import { printStepResult } from '../../logger/terminal.ts'
import { globalBus } from '../../tui/eventBus.ts'
import { classifyOutcome } from '../outcomeClassifier.ts'
import { navigatePdp } from '../steps/navigatePdp.ts'
import { handle3DSIfRequired } from '../steps/handle3DS.ts'
import { harvestSkuId } from '../dom/harvestSkuId.ts'
import { mapErrorToOutcome } from '../mapErrorToOutcome.ts'
import { RealKpsdkClient } from '../../stealth/kpsdk/protectedFetch.ts'
import { kpsdkCacheHolder } from '../../stealth/kpsdk/cache.ts'
import { getKpsdkExtractor } from '../../stealth/kpsdk/extractor.ts'
import {
	NikeCartApi,
	NikeCartViewsApi,
	NikeFulfillmentApi,
	NikePaymentApi,
	NikeReviewApi,
	NikeCheckoutsApi,
	generateVisitorId,
	toNikeAddress,
	withApiRetry,
	pickDefaultOffering,
	pickDefaultPaymentMethod,
	assertTotalMatches,
	persistReceipt,
} from '../api/index.ts'
import { captureAdyenCard } from '../dom/captureAdyenCard.ts'

export interface HybridPipelineOptions {
	productUrl: string
	targetSizes: string[]
	styleColor: string
	slug: string
	country?: string
	currency?: string
	dryRun?: boolean
	shippingAddress?: CheckoutAddress
	card?: CardData
}

export interface HybridPipelineResult {
	accountId: string
	accountEmail: string
	steps: StepResult[]
	finalOutcome: FinalOutcome
	durationMs: number
}

// Convenience: create a StepResult for a successful step.
const ok = (step: string, details?: string): StepResult => ({
	step,
	outcome: 'success',
	durationMs: 0,
	details,
})

// Resolve pipeline-effective values.
const resolveCountry = (config: BotConfig, override?: string): string =>
	override ?? config.checkout?.market ?? 'FR'

const resolveCurrency = (config: BotConfig, override?: string): string =>
	override ?? config.checkout?.currency ?? 'EUR'

/**
 * Runs the hybrid (DOM + API) checkout pipeline for one account.
 * Caller is responsible for providing an open `page` and closing the browser.
 */
export async function runHybridPipeline(
	page: Page,
	account: AccountConfig,
	config: BotConfig,
	selectors: Selectors,
	options: HybridPipelineOptions,
): Promise<HybridPipelineResult> {
	const pipelineStart = performance.now()
	const maskedEmail = maskEmail(account.email)
	const stepTimeoutMs = config.checkout?.stepTimeoutMs ?? 8000
	const {
		productUrl,
		targetSizes,
		styleColor,
		slug,
		dryRun = false,
		shippingAddress,
		card,
	} = options

	const country = resolveCountry(config, options.country)
	const currency = resolveCurrency(config, options.currency)

	const steps: StepResult[] = []

	// Stub logger for withApiRetry (avoids coupling to logger module in retry ctx).
	const logger = {
		warn: (msg: string, meta: object) => console.warn(`[hybrid] ${msg}`, meta),
		error: (msg: string, meta: object) => console.error(`[hybrid] ${msg}`, meta),
	}

	// Real KPSDK client (Epic 14.3) — invalidates cache + reloads page + force-fires
	// a fresh KPSDK extract. Wired here per code review finding H2.
	const kpsdkClient = new RealKpsdkClient(
		kpsdkCacheHolder.instance,
		account.id,
		country,
	)
	// Session refresh: re-runs the OIDC bootstrap by re-navigating to a Nike page
	// that triggers the auth handshake. Best-effort — if the snapshot is dead the
	// caller will get a SessionExpiredError from getBearerToken on next call.
	const sessionRefresh = async (): Promise<void> => {
		try {
			await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
			await page.waitForFunction(
				() =>
					Object.keys(localStorage).some((k) => k.startsWith('oidc.user:')),
				{ timeout: 10000 },
			)
		} catch {
			// best-effort; the next API call will surface SessionExpiredError
		}
	}

	const retryBase = { page, kpsdkClient, sessionRefresh, logger }

	try {
		// Attach before the first PDP navigation so Epic 14 token capture sees
		// the protected requests emitted by Nike's own page scripts.
		getKpsdkExtractor(page, country)

		// ── Step 1: DOM — PDP navigate ONLY (no size click) ───────────────────────
		// The API path resolves the SKU for the target size via harvestSkuId and
		// carts it through the API, so we never need to click the size grid. This
		// keeps the bot decoupled from Nike's volatile size-grid DOM selectors.
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: 'navigatePdp' },
		})
		const navResult = await navigatePdp(page, productUrl, selectors, stepTimeoutMs)
		steps.push(navResult)
		logStep(account.email, navResult)
		printStepResult(navResult)
		if (navResult.outcome !== 'success') {
			return buildResult(account.id, maskedEmail, steps, navResult.outcome, pipelineStart)
		}

		// ── Step 2: DOM/SDK — harvest skuId ──────────────────────────────────────
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: 'harvestSku' },
		})
		const euSize = targetSizes[0] ?? ''
		const skuId = await harvestSkuId(page, { styleColor, euSize, country })
		steps.push(ok('harvest-sku'))

		// ── Step 3: API — initVisitor + addItem ───────────────────────────────────
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: 'addToCartApi' },
		})
		const cartApi = new NikeCartApi(page, country, account.id)
		const visitorId = generateVisitorId()

		await withApiRetry(
			() => cartApi.initVisitor(visitorId),
			{ ...retryBase, step: 'init-visitor', idempotent: true },
		)

		const cart = await withApiRetry(
			() => cartApi.addItem(skuId, slug, styleColor),
			{ ...retryBase, step: 'add-item', idempotent: false },
		)
		steps.push(ok('add-to-cart-api'))

		// ── Step 4: API — openShippingView + waitForView ──────────────────────────
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: 'shippingView' },
		})
		const cartViewsApi = new NikeCartViewsApi(page)

		let nikeAddress: import('../api/cartViewsApi.types.ts').NikeAddress | undefined
		if (shippingAddress !== undefined) {
			nikeAddress = toNikeAddress(shippingAddress)
		} else {
			nikeAddress = {
				recipient: { firstName: 'N/A', lastName: 'N/A' },
				addressLines: [''],
				locality: '',
				postalCode: '',
				country,
				phoneNumber: '',
			}
		}

		const shippingView = await withApiRetry(
			() => cartViewsApi.openShippingView(cart.id, nikeAddress!),
			{ ...retryBase, step: 'open-shipping-view', idempotent: true },
		)
		await withApiRetry(
			() => cartViewsApi.waitForView(shippingView.viewId, { timeoutMs: stepTimeoutMs }),
			{ ...retryBase, step: 'wait-shipping-view', idempotent: true },
		)
		steps.push(ok('shipping-view'))

		// ── Step 5: API — listOfferings → pickDefaultOffering → startPricingJob ──
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: 'fulfillment' },
		})
		const fulfillmentApi = new NikeFulfillmentApi(page)

		const offerings = await withApiRetry(
			() => fulfillmentApi.listOfferings({ country, currency, skuId }),
			{ ...retryBase, step: 'list-offerings', idempotent: true },
		)
		const selectedOffering = pickDefaultOffering(offerings, country, skuId)

		const pricingJob = await withApiRetry(
			() => fulfillmentApi.startPricingJob({ cartId: cart.id, offeringId: selectedOffering.offeringId }),
			{ ...retryBase, step: 'start-pricing-job', idempotent: true },
		)
		await withApiRetry(
			() => fulfillmentApi.waitForJob(pricingJob.jobId, { timeoutMs: stepTimeoutMs }),
			{ ...retryBase, step: 'wait-pricing-job', idempotent: true },
		)
		steps.push(ok('fulfillment'))

		// ── Step 6: API — listOptions → pickDefaultPaymentMethod → bindPaymentMethod
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: 'payment' },
		})
		const paymentApi = new NikePaymentApi(page)

		let paymentMethods = await withApiRetry(
			() => paymentApi.listOptions({ cartId: cart.id, country, currency }),
			{ ...retryBase, step: 'list-payment-options', idempotent: true },
		)

		// ── Step 7: DOM (conditional) — Adyen card capture ───────────────────────
		if (paymentMethods.length === 0 && card !== undefined) {
			globalBus.emit('accountStatusChanged', {
				accountId: account.id,
				status: { kind: 'waiting', step: 'adyenCapture' },
			})
			const captureResult = await captureAdyenCard({
				page,
				selectors,
				card,
				timeoutMs: stepTimeoutMs,
			})
			steps.push(captureResult)
			logStep(account.email, captureResult)
			printStepResult(captureResult)
			if (captureResult.outcome !== 'success') {
				return buildResult(account.id, maskedEmail, steps, captureResult.outcome, pipelineStart)
			}

			// Re-fetch payment methods after card capture.
			paymentMethods = await withApiRetry(
				() => paymentApi.listOptions({ cartId: cart.id, country, currency }),
				{ ...retryBase, step: 'list-payment-options-retry', idempotent: true },
			)
		}

		const paymentMethod = pickDefaultPaymentMethod(paymentMethods, { prefer: 'CARD' })
		await withApiRetry(
			() => paymentApi.bindPaymentMethod({ viewId: shippingView.viewId, methodId: paymentMethod.methodId }),
			{ ...retryBase, step: 'bind-payment-method', idempotent: true },
		)
		steps.push(ok('payment'))

		// ── Step 8: API — openReview + waitForReview + assertTotalMatches ─────────
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: 'review' },
		})
		const reviewApi = new NikeReviewApi(page)

		const review = await withApiRetry(
			() => reviewApi.openReview({ cartId: cart.id }),
			{ ...retryBase, step: 'open-review', idempotent: true },
		)
		const readyReview = await withApiRetry(
			() => reviewApi.waitForReview(review.reviewId, { timeoutMs: stepTimeoutMs }),
			{ ...retryBase, step: 'wait-review', idempotent: true },
		)

		if (readyReview.computedTotal !== undefined) {
			// Self-validate: subtotal + shipping must equal the server-computed total.
			// (Tax is server-side; we trust Nike's tax but reject unexpected variance.)
			const ct = readyReview.computedTotal
			const expectedTotal = Number((ct.subtotal + ct.shipping + ct.tax).toFixed(2))
			assertTotalMatches(expectedTotal, ct)
		}
		steps.push(ok('review'))

		// ── Step 9: API — submit checkout (or dry-run skip) ────────────────────────
		globalBus.emit('accountStatusChanged', {
			accountId: account.id,
			status: { kind: 'waiting', step: dryRun ? 'dryRun' : 'submitCheckout' },
		})

		if (dryRun) {
			console.log('[hybrid] dry-run: skipping PUT /buy/checkouts/<cartId>')
			steps.push({
				step: 'submit',
				outcome: 'success',
				durationMs: 0,
				details: JSON.stringify({
					skipped: 'dry-run',
					wouldSubmitCartId: cart.id,
					wouldSubmitTotal: readyReview.computedTotal?.total,
				}),
			})
			const finalOutcome = classifyOutcome(steps)
			return {
				accountId: account.id,
				accountEmail: maskedEmail,
				steps,
				finalOutcome,
				durationMs: Math.round(performance.now() - pipelineStart),
			}
		}

		// ── Step 9 (live): PUT /buy/checkouts/<cartId> ────────────────────────────
		const checkoutsApi = new NikeCheckoutsApi(page)
		const submitResp = await withApiRetry(
			() => checkoutsApi.submit(cart.id),
			{ ...retryBase, step: 'submit-checkout', idempotent: true },
		)

		// Persist PII-redacted receipt (mode 0o600, no address/card fields).
		const dataDir = config.daemon?.pidFile
			? config.daemon.pidFile.replace(/\/[^/]+$/, '')
			: '.'
		const receiptPath = await persistReceipt(dataDir, account.id, cart.id, submitResp)
		console.log(`[checkout] receipt persisted: ${receiptPath}`)

		// Log auditable transaction signal (NOT the full Nike response — may contain transient tokens).
		console.log(JSON.stringify({
			event: 'cop',
			accountId: account.id,
			orderNumber: submitResp.orderNumber,
			totalAmount: submitResp.totalAmount,
			currency: submitResp.currency,
			receiptPath,
		}))

		steps.push(ok('submit', `order=${submitResp.orderNumber}`))

		// ── Step 10: DOM (reactive) — 3DS challenge ───────────────────────────────
		const threeDSStepResult = await handle3DSIfRequired(page, selectors, stepTimeoutMs)
		const effective3DS: StepResult = threeDSStepResult ?? {
			step: '3ds-check',
			outcome: 'success' as const,
			durationMs: 0,
			details: 'not_required',
		}
		steps.push(effective3DS)
		logStep(account.email, effective3DS)
		printStepResult(effective3DS)
		if (effective3DS.outcome !== 'success') {
			return buildResult(account.id, maskedEmail, steps, effective3DS.outcome, pipelineStart)
		}

		const finalOutcome = classifyOutcome(steps)
		console.log(`[checkout] Hybrid pipeline complete for ${maskedEmail}`)
		return {
			accountId: account.id,
			accountEmail: maskedEmail,
			steps,
			finalOutcome,
			durationMs: Math.round(performance.now() - pipelineStart),
		}
	} catch (e) {
		const { outcome, steps: stepsWithError } = mapErrorToOutcome(e, steps)
		return {
			accountId: account.id,
			accountEmail: maskedEmail,
			steps: stepsWithError,
			finalOutcome: outcome,
			durationMs: Math.round(performance.now() - pipelineStart),
		}
	}
}

function buildResult(
	accountId: string,
	accountEmail: string,
	steps: StepResult[],
	outcome: import('../executeStep.ts').StepOutcome,
	pipelineStart: number,
): HybridPipelineResult {
	const outcomeMap: Record<import('../executeStep.ts').StepOutcome, FinalOutcome> = {
		success: 'success',
		sold_out: 'sold_out',
		blocked: 'blocked',
		'3ds_required': 'error',
		'3ds_timeout': '3ds_timeout',
		timeout: 'timeout',
		no_session: 'no_session',
		error: 'error',
	}
	return {
		accountId,
		accountEmail,
		steps,
		finalOutcome: outcomeMap[outcome],
		durationMs: Math.round(performance.now() - pipelineStart),
	}
}
