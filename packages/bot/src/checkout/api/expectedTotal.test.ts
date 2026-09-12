import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { computeExpectedTotal } from './expectedTotal.ts'

describe('computeExpectedTotal', () => {
	it('sums pdpPrice + fulfillmentCost and rounds to 2 decimal places', () => {
		const result = computeExpectedTotal({ pdpPrice: 100.00, fulfillmentCost: 10.00, currency: 'EUR' })
		assert.equal(result, 110.00)
	})

	it('handles float-arithmetic noise — result is a 2-decimal number', () => {
		// Verify toFixed(2) and Number() produce a proper rounded 2-decimal result
		const result = computeExpectedTotal({ pdpPrice: 99.99, fulfillmentCost: 10.01, currency: 'EUR' })
		assert.equal(result, 110.00)
	})

	it('handles zero fulfillmentCost (free shipping)', () => {
		const result = computeExpectedTotal({ pdpPrice: 89.99, fulfillmentCost: 0, currency: 'EUR' })
		assert.equal(result, 89.99)
	})

	it('returns a number (not a string)', () => {
		const result = computeExpectedTotal({ pdpPrice: 50.00, fulfillmentCost: 5.00, currency: 'GBP' })
		assert.equal(typeof result, 'number')
	})

	it('rounds correctly for US price example', () => {
		const result = computeExpectedTotal({ pdpPrice: 120.00, fulfillmentCost: 9.99, currency: 'USD' })
		assert.equal(result, 129.99)
	})
})
