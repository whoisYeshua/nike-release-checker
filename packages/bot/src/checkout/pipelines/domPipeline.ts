// domPipeline — v2 DOM-only checkout pipeline.
// Extracted verbatim from the original checkoutPipeline.ts body (Story 12.7).
// Self-hosted tier uses this path by default. No API modules are imported here.
//
// Story 12.7.

import type { Page } from 'playwright'
import type { BotConfig } from '../../config/botConfigSchema.ts'
import type { AccountConfig } from '../../config/accountSchema.ts'
import type { Selectors } from '../../config/selectorSchema.ts'
import { maskEmail } from '../../logger/credentialMasker.ts'
import { logStep } from '../../logger/logger.ts'
import { printStepResult } from '../../logger/terminal.ts'
import { globalBus } from '../../tui/eventBus.ts'
import type { StepResult, StepOutcome } from '../executeStep.ts'
import { classifyOutcome, type FinalOutcome } from '../outcomeClassifier.ts'
import { selectSize } from '../steps/selectSize.ts'
import { addToCart } from '../steps/addToCart.ts'
import { navigateCheckout } from '../steps/navigateCheckout.ts'
import { completeShipping, type ShippingAddress } from '../steps/completeShipping.ts'
import { completePayment, type CardData } from '../steps/completePayment.ts'
import { handle3DSIfRequired } from '../steps/handle3DS.ts'
import { submitOrder } from '../steps/submitOrder.ts'

export interface DomPipelineOptions {
	productUrl: string
	targetSizes: string[]
	dryRun?: boolean
	shippingAddress?: ShippingAddress
	card?: CardData
}

export interface DomPipelineResult {
	accountId: string
	accountEmail: string
	steps: StepResult[]
	finalOutcome: FinalOutcome
	durationMs: number
}

function stepOutcomeToFinal(outcome: StepOutcome): FinalOutcome {
	switch (outcome) {
		case 'success': return 'success'
		case 'sold_out': return 'sold_out'
		case 'blocked': return 'blocked'
		case '3ds_required': return 'error'
		case '3ds_timeout': return '3ds_timeout'
		case 'timeout': return 'timeout'
		case 'no_session': return 'no_session'
		case 'error': return 'error'
	}
}

function buildResult(
	accountId: string,
	accountEmail: string,
	steps: StepResult[],
	outcome: StepOutcome,
	pipelineStart: number,
): DomPipelineResult {
	return {
		accountId,
		accountEmail,
		steps,
		finalOutcome: stepOutcomeToFinal(outcome),
		durationMs: Math.round(performance.now() - pipelineStart),
	}
}

/**
 * Runs the v2 DOM-only checkout pipeline for one account.
 * Caller is responsible for providing an open `page` and closing the browser.
 */
export async function runDomPipeline(
	page: Page,
	account: AccountConfig,
	config: BotConfig,
	selectors: Selectors,
	options: DomPipelineOptions,
): Promise<DomPipelineResult> {
	const pipelineStart = performance.now()
	const maskedEmail = maskEmail(account.email)
	const stepTimeoutMs = config.checkout?.stepTimeoutMs ?? 8000
	const { productUrl, targetSizes, dryRun = false, shippingAddress, card } = options

	const steps: StepResult[] = []

	// Step 1: Select size
	globalBus.emit('accountStatusChanged', {
		accountId: account.id,
		status: { kind: 'waiting', step: 'selectSize' },
	})
	const sizeResult = await selectSize(page, productUrl, targetSizes, selectors, stepTimeoutMs)
	steps.push(sizeResult)
	logStep(account.email, sizeResult)
	printStepResult(sizeResult)
	if (sizeResult.outcome !== 'success') {
		return buildResult(account.id, maskedEmail, steps, sizeResult.outcome, pipelineStart)
	}

	// Step 2: Add to cart
	globalBus.emit('accountStatusChanged', {
		accountId: account.id,
		status: { kind: 'waiting', step: 'addToCart' },
	})
	const cartResult = await addToCart(page, selectors, stepTimeoutMs)
	steps.push(cartResult)
	logStep(account.email, cartResult)
	printStepResult(cartResult)
	if (cartResult.outcome !== 'success') {
		return buildResult(account.id, maskedEmail, steps, cartResult.outcome, pipelineStart)
	}

	// Step 3: Navigate to checkout
	globalBus.emit('accountStatusChanged', {
		accountId: account.id,
		status: { kind: 'waiting', step: 'navigateCheckout' },
	})
	const navResult = await navigateCheckout(page, selectors, stepTimeoutMs)
	steps.push(navResult)
	logStep(account.email, navResult)
	printStepResult(navResult)
	if (navResult.outcome !== 'success') {
		return buildResult(account.id, maskedEmail, steps, navResult.outcome, pipelineStart)
	}

	// Step 4: Complete shipping
	globalBus.emit('accountStatusChanged', {
		accountId: account.id,
		status: { kind: 'waiting', step: 'completeShipping' },
	})
	const shippingResult = await completeShipping(page, selectors, { timeoutMs: stepTimeoutMs, address: shippingAddress })
	steps.push(shippingResult)
	logStep(account.email, shippingResult)
	printStepResult(shippingResult)
	if (shippingResult.outcome !== 'success') {
		return buildResult(account.id, maskedEmail, steps, shippingResult.outcome, pipelineStart)
	}

	// Step 5: Complete payment
	globalBus.emit('accountStatusChanged', {
		accountId: account.id,
		status: { kind: 'waiting', step: 'completePayment' },
	})
	const paymentResult = await completePayment(page, selectors, { timeoutMs: stepTimeoutMs, card })
	steps.push(paymentResult)
	logStep(account.email, paymentResult)
	printStepResult(paymentResult)
	if (paymentResult.outcome !== 'success') {
		return buildResult(account.id, maskedEmail, steps, paymentResult.outcome, pipelineStart)
	}

	// Step 5b: Handle 3DS if required
	const threeDSStepResult = await handle3DSIfRequired(page, selectors, stepTimeoutMs)
	const effectiveResult: StepResult = threeDSStepResult ?? {
		step: '3ds-check',
		outcome: 'success' as const,
		durationMs: 0,
		details: 'not_required',
	}
	steps.push(effectiveResult)
	logStep(account.email, effectiveResult)
	printStepResult(effectiveResult)
	if (effectiveResult.outcome !== 'success') {
		return buildResult(account.id, maskedEmail, steps, effectiveResult.outcome, pipelineStart)
	}

	// Step 6: Submit order (dry-run aware)
	globalBus.emit('accountStatusChanged', {
		accountId: account.id,
		status: { kind: 'waiting', step: dryRun ? 'dryRun' : 'submitOrder' },
	})
	// Real submits can sit in a 3-D Secure (SCA) wait for a couple of minutes
	// while the operator approves on their bank app — give submitOrder a generous
	// race window so executeStep doesn't kill it mid-3DS. Dry-run returns instantly.
	const submitTimeoutMs = dryRun ? stepTimeoutMs : Math.max(stepTimeoutMs, 200_000)
	const submitResult = await submitOrder(page, selectors, dryRun, submitTimeoutMs)
	steps.push(submitResult)
	logStep(account.email, submitResult)
	printStepResult(submitResult)
	if (submitResult.outcome !== 'success') {
		return buildResult(account.id, maskedEmail, steps, submitResult.outcome, pipelineStart)
	}

	const finalOutcome = classifyOutcome(steps)
	console.log(`[checkout] DOM pipeline complete for ${maskedEmail}${dryRun ? ' [DRY-RUN]' : ''}`)

	return {
		accountId: account.id,
		accountEmail: maskedEmail,
		steps,
		finalOutcome,
		durationMs: Math.round(performance.now() - pipelineStart),
	}
}
