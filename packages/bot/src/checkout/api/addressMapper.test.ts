import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { toNikeAddress } from './addressMapper.ts'
import type { CheckoutAddress } from './addressMapper.ts'
import type { NikeAddress } from './cartViewsApi.types.ts'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('../../../test/fixtures/cart-view-shipping-fr.json') as {
	nikeAddress: NikeAddress
}

const FR_CHECKOUT_ADDRESS: CheckoutAddress = {
	firstName: 'Jean',
	lastName: 'Dupont',
	line1: '12 Rue de Rivoli',
	city: 'Paris',
	postalCode: '75001',
	country: 'FR',
	phone: '+33612345678',
}

describe('toNikeAddress', () => {
	it('matches captured live payload fixture byte-for-byte', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.deepEqual(result, fixture.nikeAddress)
	})

	it('maps recipient {firstName, lastName}', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.equal(result.recipient.firstName, 'Jean')
		assert.equal(result.recipient.lastName, 'Dupont')
	})

	it('maps addressLines as array with line1 as first element', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.ok(Array.isArray(result.addressLines))
		assert.equal(result.addressLines[0], '12 Rue de Rivoli')
		assert.equal(result.addressLines.length, 1)
	})

	it('includes line2 in addressLines when provided', () => {
		const withLine2: CheckoutAddress = { ...FR_CHECKOUT_ADDRESS, line2: 'Apt 3B' }
		const result = toNikeAddress(withLine2)
		assert.equal(result.addressLines[1], 'Apt 3B')
		assert.equal(result.addressLines.length, 2)
	})

	it('omits line2 from addressLines when not provided', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.equal(result.addressLines.length, 1)
	})

	it('maps locality from city', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.equal(result.locality, 'Paris')
	})

	it('maps postalCode', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.equal(result.postalCode, '75001')
	})

	it('maps country as ISO-3166 alpha-2 (FR default)', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.equal(result.country, 'FR')
	})

	it('maps phoneNumber from phone', () => {
		const result = toNikeAddress(FR_CHECKOUT_ADDRESS)
		assert.equal(result.phoneNumber, '+33612345678')
	})

	it('is pluggable for other countries (US smoke test)', () => {
		const usAddr: CheckoutAddress = {
			...FR_CHECKOUT_ADDRESS,
			country: 'US',
		}
		const result = toNikeAddress(usAddr)
		assert.equal(result.country, 'US')
	})
})
