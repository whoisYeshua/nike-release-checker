import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completePayment, normalizeExpiry } from './completePayment.ts'
import type { Selectors } from '../../config/selectorSchema.ts'

const selectors = {
	checkout: {
		paymentSection: 'section.payment',
		paymentContinueButton: 'button.payment-continue',
		threeDSIframe: 'iframe.3ds',
		submitOrderButton: 'button.submit-order',
	},
} as unknown as Selectors

interface FakeLocator {
	visible: boolean
	enabled: boolean
	value: string
	ariaDisabled: string | null
	fillCalls: string[]
	clickCalls: number
	first: () => FakeLocator
	isVisible: () => Promise<boolean>
	isEnabled: () => Promise<boolean>
	inputValue: () => Promise<string>
	fill: (v: string) => Promise<void>
	click: () => Promise<void>
	evaluate: (fn: unknown) => Promise<void>
	waitFor: () => Promise<void>
	boundingBox: () => Promise<null>
	count: () => Promise<number>
	getAttribute: (name: string) => Promise<string | null>
}

function makeLocator(opts: { visible?: boolean; enabled?: boolean; value?: string; ariaDisabled?: string | null } = {}): FakeLocator {
	const loc: FakeLocator = {
		visible: opts.visible ?? true,
		enabled: opts.enabled ?? true,
		value: opts.value ?? '',
		ariaDisabled: opts.ariaDisabled ?? null,
		fillCalls: [],
		clickCalls: 0,
		first(): FakeLocator { return loc },
		async isVisible(): Promise<boolean> { return loc.visible },
		async isEnabled(): Promise<boolean> { return loc.enabled },
		async inputValue(): Promise<string> { return loc.value },
		async fill(v: string): Promise<void> { loc.fillCalls.push(v); loc.value = v },
		async click(): Promise<void> { loc.clickCalls++ },
		async evaluate(): Promise<void> { loc.clickCalls++ },
		async waitFor(): Promise<void> { /* noop */ },
		async boundingBox(): Promise<null> { return null },
		async count(): Promise<number> { return loc.visible ? 1 : 0 },
		async getAttribute(_name: string): Promise<string | null> { return loc.ariaDisabled },
	}
	return loc
}

/**
 * `pageLocators` are looked up on page.locator(); `iframeLocators` are looked up
 * inside the paymentcc.nike.com frame (frameLocator(...).locator(...)). This
 * mirrors the real flow where the card fields live in Nike's hosted PCI iframe.
 */
function makePage(pageLocators: Record<string, FakeLocator>, iframeLocators: Record<string, FakeLocator> = {}) {
	return {
		locator(sel: string) {
			const found = pageLocators[sel]
			if (found) return found
			return makeLocator({ visible: false })
		},
		async waitForSelector(): Promise<void> { /* noop */ },
		async waitForTimeout(): Promise<void> { /* noop */ },
		// No saved card text in tests → card verification is a no-op.
		async evaluate(): Promise<string> { return '' },
		keyboard: { async press(): Promise<void> { /* noop */ } },
		mouse: {
			async move(): Promise<void> { /* noop */ },
			async wheel(): Promise<void> { /* noop */ },
		},
		frameLocator(sel: string) {
			// Only the paymentcc.nike.com frame holds card fields in these tests;
			// the adyen frame returns invisible so the impl moves on quickly.
			const map = sel.includes('paymentcc') ? iframeLocators : {}
			return {
				locator(s: string) { return map[s] ?? makeLocator({ visible: false }) },
				first() { return this },
			}
		},
	}
}

test('completePayment: success when card form is pre-filled (no continue click — submitOrder owns that)', async () => {
	// Card number lives in the iframe, already populated → form NOT empty.
	const cardNumber = makeLocator({ visible: true, value: '4242 4242 4242 4242' })
	// Review button present and ENABLED (Nike accepted the card).
	const reviewBtn = makeLocator({ visible: true, ariaDisabled: 'false' })
	const page = makePage(
		{ '[data-attr="continueToOrderReviewBtn"]': reviewBtn },
		{ '#creditCardNumber': cardNumber },
	)

	const result = await completePayment(page as never, selectors, { timeoutMs: 2000 })
	assert.equal(result.outcome, 'success')
	assert.equal(result.details, 'payment-complete')
	assert.deepEqual(cardNumber.fillCalls, [])
	// completePayment must NOT click the review/continue button — that's submitOrder.
	assert.equal(reviewBtn.clickCalls, 0)
})

test('completePayment: fills empty card form using opts.card', async () => {
	const cardNumber = makeLocator({ visible: true, value: '' })
	const expiry = makeLocator({ visible: true })
	const cvv = makeLocator({ visible: true })
	const holder = makeLocator({ visible: true })
	const reviewBtn = makeLocator({ visible: true, ariaDisabled: 'false' })

	const page = makePage(
		{
			'input[name="cardholderName"]': holder,
			'[data-attr="continueToOrderReviewBtn"]': reviewBtn,
		},
		{
			'#creditCardNumber': cardNumber,
			'#expirationDate': expiry,
			'#cvNumber': cvv,
		},
	)

	const result = await completePayment(page as never, selectors, {
		timeoutMs: 2000,
		card: {
			number: '4111111111111111',
			expiry: '12/27',
			cvv: '123',
			holderName: 'CANDID AUDIO',
		},
	})

	assert.equal(result.outcome, 'success')
	assert.equal(result.details, 'payment-filled-and-complete')
	assert.deepEqual(cardNumber.fillCalls, ['4111111111111111'])
	assert.deepEqual(expiry.fillCalls, ['12/27'])
	assert.deepEqual(cvv.fillCalls, ['123'])
	assert.deepEqual(holder.fillCalls, ['CANDID AUDIO'])
})

test('completePayment: errors when card form is empty and no card provided', async () => {
	const cardNumber = makeLocator({ visible: true, value: '' })
	const page = makePage({}, { '#creditCardNumber': cardNumber })

	const result = await completePayment(page as never, selectors, { timeoutMs: 2000 })
	assert.equal(result.outcome, 'error')
	assert.match(result.error ?? '', /payment form empty/)
})

test('normalizeExpiry: accepts MM/YY, MM/YYYY, MMYY, MMYYYY', () => {
	assert.equal(normalizeExpiry('12/30'), '12/30')
	assert.equal(normalizeExpiry('12/2030'), '12/30')
	assert.equal(normalizeExpiry('1230'), '12/30')
	assert.equal(normalizeExpiry('122030'), '12/30')
})
