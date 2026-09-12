import type { Page, Locator, FrameLocator } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import { executeStep, type StepResult } from '../executeStep.ts'
import { displayedCardMatches } from './cardMatcher.ts'

export interface CardData {
	number: string
	expiry: string
	cvv: string
	holderName: string
}

export interface CompletePaymentOpts {
	timeoutMs?: number
	card?: CardData
}

type Scope = Page | FrameLocator

async function findFirstVisibleIn(scope: Scope, candidates: string[]): Promise<Locator | null> {
	for (const sel of candidates) {
		try {
			const loc = scope.locator(sel).first()
			if (await loc.isVisible({ timeout: 250 }).catch(() => false)) {
				return loc
			}
		} catch {
			// next candidate
		}
	}
	return null
}

async function fillIfPresentIn(scope: Scope, candidates: string[], value: string | undefined): Promise<boolean> {
	if (!value) return false
	const loc = await findFirstVisibleIn(scope, candidates)
	if (!loc) return false
	try {
		await loc.fill(value)
		return true
	} catch {
		return false
	}
}

/**
 * Like findFirstVisibleIn but polls up to `timeoutMs` for ANY candidate to
 * become visible. Nike's hosted card iframe (paymentcc.nike.com) mounts a beat
 * AFTER the "Carte de paiement" radio is checked; a one-shot 250ms probe races
 * that mount and falsely concludes "no card form" → a silent fake success. This
 * waits deterministically instead.
 */
async function waitForFirstVisibleIn(scope: Scope, candidates: string[], timeoutMs: number): Promise<Locator | null> {
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const loc = await findFirstVisibleIn(scope, candidates)
		if (loc) return loc
		if (Date.now() >= deadline) return null
		// Sleep between polls so a not-yet-mounted iframe doesn't busy-spin the CPU.
		await new Promise((r) => setTimeout(r, 150))
	}
}

/**
 * Normalize an expiry to the MM/YY shape Nike's "MM/AA" field expects.
 * Accepts "12/30", "12/2030", "1230", "122030" → "12/30".
 */
export function normalizeExpiry(raw: string): string {
	const digits = raw.replace(/\D/g, '')
	if (digits.length < 4) return raw // leave as-is; field will reject if wrong
	const mm = digits.slice(0, 2)
	const yy = digits.length >= 6 ? digits.slice(4, 6) : digits.slice(2, 4)
	return `${mm}/${yy}`
}

export async function completePayment(
	page: Page,
	selectors: Selectors,
	opts: CompletePaymentOpts = {},
): Promise<StepResult> {
	const timeoutMs = opts.timeoutMs ?? 8000
	return executeStep(
		'complete-payment',
		async () => {
			// Use shorter timeout than the executeStep race timer to avoid ghost timeout
			const innerTimeout = Math.max(Math.floor(timeoutMs * 0.7), 2000)
			// Wait for payment section
			await page.waitForSelector(selectors.checkout.paymentSection, { timeout: innerTimeout })

			// Check for 3DS BEFORE filling
			const threeDSBefore = page.locator(selectors.checkout.threeDSIframe)
			const is3DSBefore = await threeDSBefore.isVisible().catch(() => false)
			if (is3DSBefore) {
				throw Object.assign(new Error('3DS iframe detected before payment continue'), { code: '3DS_REQUIRED' })
			}

			// Nike FR checkout is a single progressive page. The payment method is
			// chosen via a radio (`paymentOptions` = creditDebit | paypal | …); the
			// card form only renders once "creditDebit" is selected. Select it first.
			const creditRadio = page
				.locator('input[name="paymentOptions"][value="creditDebit"]')
				.first()
			if (await creditRadio.isVisible({ timeout: 1000 }).catch(() => false)) {
				await creditRadio.check().catch(() => {})
				// Give the card iframe a moment to mount.
				await page.waitForSelector('iframe[src*="paymentcc.nike.com"]', { timeout: innerTimeout }).catch(() => {})
			}

			// Card verification: Nike may show a SAVED card (masked "•••• 1234") on a
			// returning account. Make sure it's the card the operator configured.
			//   - matches target last4  → keep it, no re-entry needed.
			//   - different card        → click "Utiliser une autre carte / Ajouter
			//                             une carte" to reveal the new-card form, then
			//                             fall through to fill the configured card.
			// Best-effort + fallback: never throw on this path.
			if (opts.card) {
				const pageText = await page.evaluate(() => document.body.innerText).catch(() => '')
				const hasMaskedCard = /(?:[•·*●]\s?){2,}\d{4}|se\s+terminant\s+par\s+\d{4}|ending\s+in\s+\d{4}/i.test(pageText)
				if (hasMaskedCard) {
					if (displayedCardMatches(pageText, opts.card.number)) {
						return 'payment-saved-card-matched'
					}
					console.warn(
						'[payment] saved card does not match the configured card — switching to a new card',
					)
					const useOther = await findFirstVisibleIn(page, [
						'button:has-text("Utiliser une autre carte")',
						'button:has-text("Ajouter une carte")',
						'button:has-text("Ajouter une nouvelle carte")',
						'button:has-text("Use a different card")',
						'button:has-text("Add a card")',
					])
					if (useOther) {
						await useOther.click().catch(() => {})
						await page.waitForSelector('iframe[src*="paymentcc.nike.com"]', { timeout: innerTimeout }).catch(() => {})
					}
				}
			}

			// Card fields live inside Nike's hosted PCI iframe — historically Adyen
			// (iframe[src*="adyen"]), now paymentcc.nike.com. Verified live 2026-05-29:
			// fields are #creditCardNumber, #expirationDate ("MM/AA"), #cvNumber.
			// Wait DETERMINISTICALLY for the number field (the iframe mounts a beat
			// after the radio is checked) rather than a 250ms probe that races it.
			const NUMBER_SELS = [
				'#creditCardNumber',
				'input[name="cardNumber"]',
				'input[name="encryptedCardNumber"]',
				'input[autocomplete="cc-number"]',
			]
			let scope: Scope = page.frameLocator('iframe[src*="paymentcc.nike.com"]').first()
			let cardNumberLoc = await waitForFirstVisibleIn(scope, NUMBER_SELS, innerTimeout)
			if (!cardNumberLoc) {
				scope = page.frameLocator('iframe[src*="adyen"]').first()
				cardNumberLoc = await waitForFirstVisibleIn(scope, [
					'input[name="encryptedCardNumber"]',
					'input[name="cardNumber"]',
					'input[aria-label*="arte"]',
				], 2500)
			}
			if (!cardNumberLoc) {
				// Iframe not present (or rotated) — fall back to the main page DOM.
				scope = page
				cardNumberLoc = await findFirstVisibleIn(scope, NUMBER_SELS)
			}

			if (!cardNumberLoc) {
				// No new-card form, and (since a matching saved card already returned
				// above) no usable saved card either. FAIL LOUDLY — never report a
				// silent success with no card entered, which left submitOrder hanging.
				throw Object.assign(
					new Error('payment card field not found (card iframe did not mount)'),
					{ code: 'ERROR' },
				)
			}

			// Fill all card fields. Re-resolves the paymentcc iframe each call because
			// it can RE-MOUNT (e.g. right after a shipping-address change), which
			// invalidates a previously-resolved locator and silently drops the values.
			// Nike's masker reformats .fill() values (e.g. "4242…" → "4242 4242 …"),
			// so strip spaces from the source first.
			const fillCard = async (cardData: CardData): Promise<void> => {
				let fillScope: Scope = page.frameLocator('iframe[src*="paymentcc.nike.com"]').first()
				let numLoc = await waitForFirstVisibleIn(fillScope, NUMBER_SELS, 4000)
				if (!numLoc) { fillScope = scope; numLoc = cardNumberLoc }
				await numLoc?.fill(cardData.number.replace(/\s+/g, '')).catch(() => {})
				await fillIfPresentIn(fillScope, [
					'#expirationDate', 'input[name="encryptedExpiryDate"]', 'input[name="expirationDate"]',
					'input[name="expiry"]', 'input[autocomplete="cc-exp"]', 'input[aria-label*="xpiration"]',
				], normalizeExpiry(cardData.expiry))
				await fillIfPresentIn(fillScope, [
					'#cvNumber', 'input[name="encryptedSecurityCode"]', 'input[name="cvNumber"]',
					'input[name="cvv"]', 'input[autocomplete="cc-csc"]', 'input[aria-label*="ryptogramme"]',
				], cardData.cvv)
				// Holder name lives on the parent page (not the iframe); Nike FR doesn't
				// require it (billing = shipping). Best-effort.
				await fillIfPresentIn(page, [
					'input[name="cardholderName"]', 'input[name="holderName"]',
					'input[autocomplete="cc-name"]', 'input[aria-label*="itulaire"]',
				], cardData.holderName)
				// Blur so Nike's React validation runs and enables the review button.
				await page.keyboard.press('Tab').catch(() => {})
			}

			// Detect empty card form: if the card-number input is empty, fill it.
			const cardNumberValue = await cardNumberLoc.inputValue().catch(() => '')
			const cardFormEmpty = cardNumberValue.trim() === ''

			if (cardFormEmpty) {
				if (!opts.card) {
					throw Object.assign(
						new Error('payment form empty and no card provided'),
						{ code: 'ERROR' },
					)
				}
				await fillCard(opts.card)
			}

			// Check for 3DS AFTER filling — Nike may redirect to 3DS after payment selection
			const threeDSAfter = page.locator(selectors.checkout.threeDSIframe)
			const is3DSAfter = await threeDSAfter.isVisible().catch(() => false)
			if (is3DSAfter) {
				throw Object.assign(new Error('3DS iframe detected after payment continue'), { code: '3DS_REQUIRED' })
			}

			// Confirm Nike ACCEPTED the card: the "Continuer pour voir le récapitulatif"
			// button (data-attr=continueToOrderReviewBtn) is aria-disabled="true" until
			// number+expiry+cvv pass client validation, then flips enabled. This is the
			// real success signal. If it stays disabled, RE-FILL once (the iframe may have
			// re-mounted between resolve and fill — observed after an address switch) before
			// failing. (Don't click it — submitOrder owns the review→submit transition.)
			const reviewBtn = page.locator('[data-attr="continueToOrderReviewBtn"]').first()
			const reviewBtnPresent = await reviewBtn.count().then((c) => c > 0).catch(() => false)
			if (reviewBtnPresent) {
				const waitEnable = async (ms: number): Promise<boolean> => {
					const deadline = Date.now() + ms
					while (Date.now() < deadline) {
						if ((await reviewBtn.getAttribute('aria-disabled').catch(() => null)) !== 'true') return true
						await page.waitForTimeout(300)
					}
					return false
				}
				let accepted = await waitEnable(Math.min(8000, innerTimeout))
				if (!accepted && cardFormEmpty && opts.card) {
					// Re-fill once — the iframe likely re-mounted and dropped the values.
					await fillCard(opts.card)
					accepted = await waitEnable(innerTimeout)
				}
				if (!accepted) {
					throw Object.assign(
						new Error('card entered but Nike did not accept it (review button stayed disabled — invalid/declined card?)'),
						{ code: 'ERROR' },
					)
				}
			}

			return cardFormEmpty ? 'payment-filled-and-complete' : 'payment-complete'
		},
		timeoutMs,
	)
}
