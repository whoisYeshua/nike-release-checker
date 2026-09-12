import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import {
	NikeReviewApi,
	ReviewTimeoutError,
	ReviewError,
	TotalMismatchError,
	assertTotalMatches,
} from './reviewApi.ts'
import type { CartReview, ComputedTotal } from './reviewApi.types.ts'

// ─── Mock factory ─────────────────────────────────────────────────────────────

interface EvaluateCall {
	url: string
	method: string
	headers?: Record<string, string>
	data?: string
}

function mockPage(spec: {
	ok?: boolean
	status?: number
	json?: unknown
	text?: string
	bearer?: string
} = {}) {
	const calls: EvaluateCall[] = []
	const ok = spec.ok ?? true
	const status = spec.status ?? (ok ? 200 : 500)
	const bodyText = spec.text ?? (spec.json !== undefined ? JSON.stringify(spec.json) : '')
	const bearer = spec.bearer ?? 'mock-bearer-token'

	const page = {
		evaluate: async (_fn: unknown, args?: Record<string, unknown>) => {
			if (!args || !('token' in args)) {
				return {
					token: bearer,
					probedKeys: ['oidc.user:https://accounts.nike.com:abc'],
				}
			}
			const url = args['url'] as string
			const method = args['method'] as string
			const headers = args['headers'] as Record<string, string> | undefined
			const data = args['data'] as string | null | undefined
			calls.push({ url, method, headers, data: data ?? undefined })
			return { status, headers: {}, body: bodyText, ok }
		},
	} as unknown as Page

	return { page, calls }
}

function mockPageSequence(
	bearerToken: string,
	responses: Array<{ ok: boolean; status: number; json?: unknown; text?: string }>,
) {
	const calls: EvaluateCall[] = []
	let fetchCallIndex = 0

	const page = {
		evaluate: async (_fn: unknown, args?: Record<string, unknown>) => {
			if (!args || !('token' in args)) {
				return { token: bearerToken, probedKeys: [] }
			}
			const url = args['url'] as string
			const method = args['method'] as string
			const headers = args['headers'] as Record<string, string> | undefined
			const data = args['data'] as string | null | undefined
			calls.push({ url, method, headers, data: data ?? undefined })

			const spec = responses[fetchCallIndex] ?? responses.at(-1)!
			fetchCallIndex++
			return {
				status: spec.status,
				headers: {},
				body: spec.json !== undefined ? JSON.stringify(spec.json) : (spec.text ?? ''),
				ok: spec.ok,
			}
		},
	} as unknown as Page

	return { page, calls }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CART_ID = 'test-cart-uuid-12-6'
const REVIEW_ID = 'review-uuid-1'

const pendingReview: CartReview = {
	reviewId: REVIEW_ID,
	status: 'PENDING',
	cartId: CART_ID,
}

const readyReview: CartReview = {
	reviewId: REVIEW_ID,
	status: 'READY',
	cartId: CART_ID,
	computedTotal: {
		subtotal: 100.00,
		shipping: 10.00,
		tax: 0.00,
		total: 110.00,
		currency: 'EUR',
	},
	lineItems: [
		{ skuId: 'sku-001', displayName: 'Air Max 90', size: '42', quantity: 1, unitPrice: 100.00 },
	],
}

const errorReview: CartReview = {
	reviewId: REVIEW_ID,
	status: 'ERROR',
	cartId: CART_ID,
}

const baseComputedTotal: ComputedTotal = {
	subtotal: 100.00,
	shipping: 10.00,
	tax: 0.00,
	total: 110.00,
	currency: 'EUR',
}

// ─── assertTotalMatches ───────────────────────────────────────────────────────

describe('assertTotalMatches', () => {
	it('ε=0.005 is within tolerance → does not throw', () => {
		const computed: ComputedTotal = { ...baseComputedTotal, total: 110.005 }
		assert.doesNotThrow(() => assertTotalMatches(110.00, computed))
	})

	it('exact match → does not throw', () => {
		assert.doesNotThrow(() => assertTotalMatches(110.00, baseComputedTotal))
	})

	it('ε=0.02 above tolerance → throws TotalMismatchError with correct delta', () => {
		const computed: ComputedTotal = { ...baseComputedTotal, total: 110.02 }
		try {
			assertTotalMatches(110.00, computed)
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof TotalMismatchError)
			assert.equal(err.expected, 110.00)
			assert.equal(err.computed, computed)
			assert.ok(Math.abs(err.delta - 0.02) < 1e-9, `delta should be ~0.02, got ${err.delta}`)
		}
	})

	it('5 EUR drift → throws (canonical promo-expired case)', () => {
		const computed: ComputedTotal = { ...baseComputedTotal, total: 115.00 }
		try {
			assertTotalMatches(110.00, computed)
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof TotalMismatchError)
			assert.ok(Math.abs(err.delta - 5.00) < 1e-9, `delta should be 5.00, got ${err.delta}`)
		}
	})

	it('TotalMismatchError message contains expected, computed, delta, currency', () => {
		const computed: ComputedTotal = { ...baseComputedTotal, total: 115.00 }
		try {
			assertTotalMatches(110.00, computed)
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof TotalMismatchError)
			assert.ok(err.message.includes('110'), 'message should mention expected')
			assert.ok(err.message.includes('115'), 'message should mention computed')
			assert.ok(err.message.includes('EUR'), 'message should mention currency')
		}
	})
})

// ─── openReview ───────────────────────────────────────────────────────────────

describe('NikeReviewApi.openReview', () => {
	it('issues PUT to /buy/cart_reviews/v2/{reviewUuid}', async () => {
		const fixedUuid = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'
		const { page, calls } = mockPage({ json: pendingReview })
		const api = new NikeReviewApi(page, () => fixedUuid)

		await api.openReview({ cartId: CART_ID })

		assert.equal(calls.length, 1)
		assert.equal(calls[0]!.url, `https://api.nike.com/buy/cart_reviews/v2/${fixedUuid}`)
		assert.equal(calls[0]!.method, 'PUT')
	})

	it('sets content-type: application/json; charset=UTF-8 (NOT json-patch+json)', async () => {
		const { page, calls } = mockPage({ json: pendingReview })
		const api = new NikeReviewApi(page, () => 'uuid-1')

		await api.openReview({ cartId: CART_ID })

		assert.equal(calls[0]!.headers?.['content-type'], 'application/json; charset=UTF-8')
	})

	it('sets accept: application/json header', async () => {
		const { page, calls } = mockPage({ json: pendingReview })
		const api = new NikeReviewApi(page, () => 'uuid-1')

		await api.openReview({ cartId: CART_ID })

		assert.equal(calls[0]!.headers?.['accept'], 'application/json')
	})

	it('sends body with {cartId}', async () => {
		const { page, calls } = mockPage({ json: pendingReview })
		const api = new NikeReviewApi(page, () => 'uuid-1')

		await api.openReview({ cartId: CART_ID })

		const body = JSON.parse(calls[0]!.data ?? '{}')
		assert.deepEqual(body, { cartId: CART_ID })
	})

	it('merges reviewId from uuid into response', async () => {
		const fixedUuid = 'merged-uuid-check'
		const nikeResponse = { status: 'PENDING' as const, cartId: CART_ID }
		const { page } = mockPage({ json: nikeResponse })
		const api = new NikeReviewApi(page, () => fixedUuid)

		const result = await api.openReview({ cartId: CART_ID })

		assert.equal(result.reviewId, fixedUuid)
		assert.equal(result.status, 'PENDING')
	})

	it('throws ReviewApiError on non-ok response', async () => {
		const { page } = mockPage({ ok: false, status: 403, text: '{"error":"forbidden"}' })
		const api = new NikeReviewApi(page, () => 'uuid-1')

		await assert.rejects(() => api.openReview({ cartId: CART_ID }))
	})
})

// ─── waitForReview ────────────────────────────────────────────────────────────

describe('NikeReviewApi.waitForReview', () => {
	it('PENDING → READY → resolves with full review', async () => {
		const sequence = [
			{ ok: true, status: 200, json: pendingReview },
			{ ok: true, status: 200, json: pendingReview },
			{ ok: true, status: 200, json: readyReview },
		]
		const { page, calls } = mockPageSequence('mock-bearer', sequence)
		const api = new NikeReviewApi(page)

		const result = await api.waitForReview(REVIEW_ID, { intervalMs: 0 })

		assert.deepEqual(result, readyReview)
		assert.equal(calls.length, 3)
		for (const c of calls) {
			assert.equal(c.url, `https://api.nike.com/buy/cart_reviews/v2/${REVIEW_ID}`)
			assert.equal(c.method, 'GET')
		}
	})

	it('resolves immediately when first poll is READY', async () => {
		const { page, calls } = mockPage({ json: readyReview })
		const api = new NikeReviewApi(page)

		const result = await api.waitForReview(REVIEW_ID, { intervalMs: 0 })

		assert.deepEqual(result, readyReview)
		assert.equal(calls.length, 1)
	})

	it('PENDING → ERROR → throws ReviewError immediately', async () => {
		const sequence = [
			{ ok: true, status: 200, json: pendingReview },
			{ ok: true, status: 200, json: errorReview },
		]
		const { page, calls } = mockPageSequence('mock-bearer', sequence)
		const api = new NikeReviewApi(page)

		await assert.rejects(
			() => api.waitForReview(REVIEW_ID, { intervalMs: 0 }),
			(err: unknown) => {
				assert.ok(err instanceof ReviewError)
				assert.deepEqual(err.review, errorReview)
				return true
			},
		)

		assert.equal(calls.length, 2, 'must stop polling after ERROR')
	})

	it('timeout → throws ReviewTimeoutError', async () => {
		const { page } = mockPage({ json: pendingReview })
		const api = new NikeReviewApi(page)

		await assert.rejects(
			() => api.waitForReview(REVIEW_ID, { timeoutMs: 10, intervalMs: 0 }),
			(err: unknown) => {
				assert.ok(err instanceof ReviewTimeoutError)
				assert.equal(err.reviewId, REVIEW_ID)
				assert.equal(err.lastStatus, 'PENDING')
				assert.ok(err.elapsedMs >= 0)
				return true
			},
		)
	})

	it('ReviewTimeoutError carries all required fields', async () => {
		const { page } = mockPage({ json: pendingReview })
		const api = new NikeReviewApi(page)

		try {
			await api.waitForReview('some-review-id', { timeoutMs: 1, intervalMs: 0 })
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof ReviewTimeoutError)
			assert.equal(err.reviewId, 'some-review-id')
			assert.equal(err.lastStatus, 'PENDING')
			assert.ok(typeof err.elapsedMs === 'number')
		}
	})
})
