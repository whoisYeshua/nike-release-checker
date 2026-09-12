import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completeShipping } from './completeShipping.ts'
import type { Selectors } from '../../config/selectorSchema.ts'

// Build a fake Selectors object with the only fields completeShipping touches.
const selectors = {
	checkout: {
		shippingContinueButton: 'button.shipping-continue',
		paymentSection: 'section.payment',
	},
} as unknown as Selectors

interface FakeLocator {
	visible: boolean
	value: string
	fillCalls: string[]
	clickCalls: number
	first: () => FakeLocator
	isVisible: () => Promise<boolean>
	inputValue: () => Promise<string>
	fill: (v: string) => Promise<void>
	click: () => Promise<void>
	evaluate: (fn: unknown) => Promise<void>
	waitFor: () => Promise<void>
	boundingBox: () => Promise<null>
}

function makeLocator(opts: { visible?: boolean; value?: string } = {}): FakeLocator {
	const loc: FakeLocator = {
		visible: opts.visible ?? true,
		value: opts.value ?? '',
		fillCalls: [],
		clickCalls: 0,
		first(): FakeLocator { return loc },
		async isVisible(): Promise<boolean> { return loc.visible },
		async inputValue(): Promise<string> { return loc.value },
		async fill(v: string): Promise<void> { loc.fillCalls.push(v); loc.value = v },
		async click(): Promise<void> { loc.clickCalls++ },
		async evaluate(): Promise<void> { loc.clickCalls++ },
		async waitFor(): Promise<void> { /* noop */ },
		async boundingBox(): Promise<null> { return null },
	}
	return loc
}

function makePage(locators: Record<string, FakeLocator>): { page: unknown } {
	const page = {
		locator(sel: string) {
			const found = locators[sel]
			if (found) return found
			return makeLocator({ visible: false })
		},
		async waitForSelector(): Promise<void> { /* noop */ },
		async waitForTimeout(): Promise<void> { /* noop */ },
		mouse: {
			async move(): Promise<void> { /* noop */ },
			async wheel(): Promise<void> { /* noop */ },
		},
		keyboard: {
			async press(): Promise<void> { /* noop */ },
			async type(): Promise<void> { /* noop */ },
		},
		frameLocator(sel: string) {
			return {
				locator(s: string) {
					const found = locators[`${sel}>>${s}`]
					if (found) return found
					return makeLocator({ visible: false })
				},
				first() { return this },
			}
		},
	}
	return { page }
}

test('completeShipping: clicks continue when form is pre-filled', async () => {
	// address1 input is visible and already populated → form is NOT empty.
	const continueBtn = makeLocator({ visible: true })
	const address1 = makeLocator({ visible: true, value: '123 Existing St' })
	const { page } = makePage({
		'button.shipping-continue': continueBtn,
		'input[name="address1"]': address1,
	})

	const result = await completeShipping(page as never, selectors, { timeoutMs: 1000 })
	assert.equal(result.outcome, 'success')
	assert.equal(result.details, 'shipping-complete')
	assert.equal(continueBtn.clickCalls, 1)
	// No fill should have happened since form was pre-filled.
	assert.deepEqual(address1.fillCalls, [])
})

test('completeShipping: fills empty form using opts.address', async () => {
	const continueBtn = makeLocator({ visible: true })
	const address1 = makeLocator({ visible: true, value: '' })
	const city = makeLocator({ visible: true })
	const zip = makeLocator({ visible: true })
	const country = makeLocator({ visible: true })
	const phone = makeLocator({ visible: true })

	const { page } = makePage({
		'button.shipping-continue': continueBtn,
		'input[name="address.address1"]': address1,
		'input[name="address.city"]': city,
		'input[name="address.postalCode"]': zip,
		'input[name="address.country"]': country,
		'input[name="address.phoneNumber"]': phone,
	})

	const result = await completeShipping(page as never, selectors, {
		timeoutMs: 1000,
		address: {
			street: '42 Rue de la Paix',
			city: 'Paris',
			zip: '75002',
			country: 'FR',
			phone: '+33612345678',
		},
	})

	assert.equal(result.outcome, 'success')
	assert.equal(result.details, 'shipping-filled-and-complete')
	assert.deepEqual(address1.fillCalls, ['42 Rue de la Paix'])
	assert.deepEqual(city.fillCalls, ['Paris'])
	assert.deepEqual(zip.fillCalls, ['75002'])
	// country is intentionally skipped (readonly select on Nike)
	assert.deepEqual(country.fillCalls, [])
	assert.deepEqual(phone.fillCalls, ['+33612345678'])
	assert.equal(continueBtn.clickCalls, 1)
})

test('completeShipping: errors when form is empty and no address provided', async () => {
	const continueBtn = makeLocator({ visible: true })
	const address1 = makeLocator({ visible: true, value: '' })
	const { page } = makePage({
		'button.shipping-continue': continueBtn,
		'input[name="address1"]': address1,
	})

	const result = await completeShipping(page as never, selectors, { timeoutMs: 1000 })
	assert.equal(result.outcome, 'error')
	assert.match(result.error ?? '', /shipping form empty/)
	assert.equal(continueBtn.clickCalls, 0)
})
