// Unit tests for NikeCheckoutsApi (Story 12.8)
// Covers: happy path, error branches, PENDING_3DS passthrough.
// Pattern: node:test + node:assert, ESM, tabs.

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import {
	NikeCheckoutsApi,
	CheckoutKpsdkBlockedError,
	CheckoutServerError,
	CheckoutDeclinedError,
} from './checkoutsApi.ts'
import type { CheckoutResponse } from './checkoutsApi.types.ts'

// ─── Mock factory ─────────────────────────────────────────────────────────────

interface FetchCall {
	url: string
	method: string
	body: string | null | undefined
	headers: Record<string, string>
}

function mockPage(spec: {
	ok?: boolean
	status?: number
	json?: unknown
	text?: string
	bearer?: string
}) {
	const ok = spec.ok ?? true
	const status = spec.status ?? (ok ? 200 : 500)
	const bodyText = spec.text ?? (spec.json !== undefined ? JSON.stringify(spec.json) : '')
	const bearer = spec.bearer ?? 'mock-bearer-token'
	const fetchCalls: FetchCall[] = []

	const page = {
		evaluate: async (_fn: unknown, args?: Record<string, unknown>) => {
			// First call: getBearerToken probe (no 'url' key)
			if (!args || !('url' in args)) {
				return {
					token: bearer,
					probedKeys: ['oidc.user:https://accounts.nike.com:abc'],
				}
			}
			// Second call: actual fetch
			fetchCalls.push({
				url: args['url'] as string,
				method: 'PUT',
				body: '{}',
				headers: {},
			})
			return { status, headers: {}, body: bodyText, ok }
		},
	} as unknown as Page

	return { page, fetchCalls }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CART_ID = 'cart-uuid-12-8'

const confirmedResponse: CheckoutResponse = {
	orderNumber: 'ORD-001',
	orderId: 'order-id-001',
	status: 'CONFIRMED',
	totalAmount: 110.00,
	currency: 'EUR',
}

const pending3dsResponse: CheckoutResponse = {
	orderNumber: 'ORD-3DS',
	orderId: 'order-id-3ds',
	status: 'PENDING_3DS',
	totalAmount: 110.00,
	currency: 'EUR',
}

// ─── submit happy path ────────────────────────────────────────────────────────

describe('NikeCheckoutsApi.submit — happy path', () => {
	it('200 CONFIRMED → resolves with parsed CheckoutResponse', async () => {
		const { page } = mockPage({ json: confirmedResponse })
		const api = new NikeCheckoutsApi(page)

		const result = await api.submit(CART_ID)

		assert.equal(result.orderNumber, 'ORD-001')
		assert.equal(result.status, 'CONFIRMED')
		assert.equal(result.totalAmount, 110.00)
		assert.equal(result.currency, 'EUR')
	})

	it('200 PENDING_3DS → resolves (3DS handling is downstream concern)', async () => {
		const { page } = mockPage({ json: pending3dsResponse })
		const api = new NikeCheckoutsApi(page)

		const result = await api.submit(CART_ID)

		assert.equal(result.status, 'PENDING_3DS')
		assert.equal(result.orderNumber, 'ORD-3DS')
	})

	it('issues request to PUT https://api.nike.com/buy/checkouts/<cartId>', async () => {
		const { page, fetchCalls } = mockPage({ json: confirmedResponse })
		const api = new NikeCheckoutsApi(page)

		await api.submit(CART_ID)

		// fetchCalls[0] is the actual fetch (evaluate second call captures url)
		assert.equal(fetchCalls[0]?.url, `https://api.nike.com/buy/checkouts/${CART_ID}`)
	})
})

// ─── error branches ───────────────────────────────────────────────────────────

describe('NikeCheckoutsApi.submit — error branches', () => {
	it('403 → throws CheckoutKpsdkBlockedError with correct cartId', async () => {
		const { page } = mockPage({ ok: false, status: 403, text: 'forbidden' })
		const api = new NikeCheckoutsApi(page)

		try {
			await api.submit(CART_ID)
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof CheckoutKpsdkBlockedError, `expected CheckoutKpsdkBlockedError, got ${String(err)}`)
			assert.equal(err.cartId, CART_ID)
			assert.equal(err.status, 403)
		}
	})

	it('500 → throws CheckoutServerError with status 500', async () => {
		const { page } = mockPage({ ok: false, status: 500, text: 'server error' })
		const api = new NikeCheckoutsApi(page)

		try {
			await api.submit(CART_ID)
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof CheckoutServerError, `expected CheckoutServerError, got ${String(err)}`)
			assert.equal(err.cartId, CART_ID)
			assert.equal(err.status, 500)
		}
	})

	it('503 → throws CheckoutServerError with status 503', async () => {
		const { page } = mockPage({ ok: false, status: 503, text: 'service unavailable' })
		const api = new NikeCheckoutsApi(page)

		try {
			await api.submit(CART_ID)
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof CheckoutServerError)
			assert.equal((err as CheckoutServerError).status, 503)
		}
	})

	it('402 → throws CheckoutDeclinedError with correct cartId', async () => {
		const { page } = mockPage({ ok: false, status: 402, text: 'payment required' })
		const api = new NikeCheckoutsApi(page)

		try {
			await api.submit(CART_ID)
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof CheckoutDeclinedError, `expected CheckoutDeclinedError, got ${String(err)}`)
			assert.equal(err.cartId, CART_ID)
			assert.equal(err.status, 402)
		}
	})

	it('404 → throws generic Error (not a typed class)', async () => {
		const { page } = mockPage({ ok: false, status: 404, text: 'not found' })
		const api = new NikeCheckoutsApi(page)

		await assert.rejects(
			() => api.submit(CART_ID),
			(err: unknown) => {
				assert.ok(err instanceof Error)
				assert.ok(!(err instanceof CheckoutKpsdkBlockedError))
				assert.ok(!(err instanceof CheckoutServerError))
				assert.ok(!(err instanceof CheckoutDeclinedError))
				return true
			},
		)
	})

	it('200 with unparseable body → throws generic Error', async () => {
		const { page } = mockPage({ ok: true, status: 200, text: 'not-json{{' })
		const api = new NikeCheckoutsApi(page)

		await assert.rejects(() => api.submit(CART_ID))
	})
})

// ─── error message quality ────────────────────────────────────────────────────

describe('NikeCheckoutsApi — error message quality', () => {
	it('CheckoutKpsdkBlockedError message contains cartId and 403', () => {
		const err = new CheckoutKpsdkBlockedError('my-cart-123')
		assert.ok(err.message.includes('my-cart-123'))
		assert.ok(err.message.includes('403'))
	})

	it('CheckoutServerError message contains cartId and status', () => {
		const err = new CheckoutServerError('my-cart-456', 503)
		assert.ok(err.message.includes('my-cart-456'))
		assert.ok(err.message.includes('503'))
	})

	it('CheckoutDeclinedError message contains cartId and 402', () => {
		const err = new CheckoutDeclinedError('my-cart-789')
		assert.ok(err.message.includes('my-cart-789'))
		assert.ok(err.message.includes('402'))
	})
})
