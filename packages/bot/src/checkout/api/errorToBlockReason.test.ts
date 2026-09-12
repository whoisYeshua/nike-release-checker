// Tests for errorToBlockReason — Story 12.9.
// One assertion per documented mapping line in errorToBlockReason.ts.
// Additional error classes (12.2-12.8) will be added as those stories land.

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { errorToBlockReason } from './errorToBlockReason.ts'
import {
	KpsdkBlockedError,
	RateLimitedError,
	ServerError,
	SessionExpiredError,
} from './apiErrors.ts'
import { NikeCartApiError } from './cartApi.ts'

// Helper: build a minimal NikeCartApiError
function cartErr(status: number): NikeCartApiError {
	return new NikeCartApiError('PATCH', '/buy/carts/v2/FR/NIKE/NIKECOM', status, '', {})
}

describe('errorToBlockReason — envelope error mappings', () => {
	it('KpsdkBlockedError → "blocked"', () => {
		assert.equal(errorToBlockReason(new KpsdkBlockedError('step')), 'blocked')
	})

	it('RateLimitedError → "rate_limited"', () => {
		assert.equal(errorToBlockReason(new RateLimitedError('step', 2)), 'rate_limited')
	})

	it('SessionExpiredError → "session_expired"', () => {
		assert.equal(errorToBlockReason(new SessionExpiredError('step')), 'session_expired')
	})

	it('ServerError → "submit_failed"', () => {
		assert.equal(errorToBlockReason(new ServerError('step', 503)), 'submit_failed')
	})
})

describe('errorToBlockReason — cart API error mapping', () => {
	it('NikeCartApiError → "cart_error"', () => {
		assert.equal(errorToBlockReason(cartErr(422)), 'cart_error')
	})

	it('NikeCartApiError with 429 status → "cart_error" (not rate_limited — envelope wraps first)', () => {
		assert.equal(errorToBlockReason(cartErr(429)), 'cart_error')
	})
})

describe('errorToBlockReason — catch-all', () => {
	it('plain Error → "unknown_error"', () => {
		assert.equal(errorToBlockReason(new Error('something unexpected')), 'unknown_error')
	})

	it('string error → "unknown_error"', () => {
		assert.equal(errorToBlockReason('bad thing'), 'unknown_error')
	})

	it('null → "unknown_error"', () => {
		assert.equal(errorToBlockReason(null), 'unknown_error')
	})

	it('undefined → "unknown_error"', () => {
		assert.equal(errorToBlockReason(undefined), 'unknown_error')
	})

	it('object without recognized type → "unknown_error"', () => {
		assert.equal(errorToBlockReason({ status: 403 }), 'unknown_error')
	})
})
