import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RetryController, MAX_ATTEMPTS } from './retryController.ts'
import type { CheckoutResult } from '../tui/SummaryScreen.tsx'

test('canRetry returns false after MAX_ATTEMPTS attempts', () => {
	const ctrl = new RetryController()
	const id = 'acct_1'

	// Start: attempt 1 implicitly, budget remaining.
	assert.equal(ctrl.canRetry(id), true)
	assert.equal(ctrl.getAttempts(id), 1)

	// Record retry → attempt 2 (still under cap of 3).
	ctrl.recordAttempt(id)
	assert.equal(ctrl.getAttempts(id), 2)
	assert.equal(ctrl.canRetry(id), true)

	// Record retry → attempt 3 (at cap).
	ctrl.recordAttempt(id)
	assert.equal(ctrl.getAttempts(id), MAX_ATTEMPTS)
	assert.equal(ctrl.canRetry(id), false)

	// Further attempts stay ineligible.
	ctrl.recordAttempt(id)
	assert.equal(ctrl.canRetry(id), false)
})

test('shouldRotateProxy: BLOCKED/ERROR rotate, THREEDS_TIMEOUT preserves', () => {
	const ctrl = new RetryController()
	assert.equal(ctrl.shouldRotateProxy('BLOCKED'), true)
	assert.equal(ctrl.shouldRotateProxy('ERROR'), true)
	assert.equal(ctrl.shouldRotateProxy('THREEDS_TIMEOUT'), false)
	// Other non-failing statuses default to no rotation.
	assert.equal(ctrl.shouldRotateProxy('SOLD_OUT'), false)
	assert.equal(ctrl.shouldRotateProxy('NO_SESSION'), false)
	assert.equal(ctrl.shouldRotateProxy('COP'), false)
})

test('filterRetriable drops accounts that reached the attempt cap', () => {
	const ctrl = new RetryController()

	// Push acct_capped up to the cap.
	ctrl.recordAttempt('acct_capped') // 2
	ctrl.recordAttempt('acct_capped') // 3 — at cap
	// acct_partial has one retry under its belt but is still eligible.
	ctrl.recordAttempt('acct_partial') // 2
	// acct_fresh is untouched.

	const failed: CheckoutResult[] = [
		{ accountId: 'acct_capped', status: 'BLOCKED', sku: 'X', durationMs: 10 },
		{ accountId: 'acct_partial', status: 'ERROR', sku: 'X', durationMs: 10 },
		{ accountId: 'acct_fresh', status: 'BLOCKED', sku: 'X', durationMs: 10 },
	]

	const retriable = ctrl.filterRetriable(failed)
	assert.equal(retriable.length, 2)
	const ids = retriable.map((r) => r.accountId).sort()
	assert.deepEqual(ids, ['acct_fresh', 'acct_partial'])
})
