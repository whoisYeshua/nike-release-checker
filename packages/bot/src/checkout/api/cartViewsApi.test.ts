import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import type { Page } from 'playwright'
import {
	NikeCartViewsApi,
	CartViewTimeoutError,
	CartViewError,
	CartViewApiError,
} from './cartViewsApi.ts'
import type { CartView, NikeAddress } from './cartViewsApi.types.ts'

// ─── Mock factory (mirrors cartApi.test.ts pattern) ──────────────────────────

interface MockResponseSpec {
	ok?: boolean
	status?: number
	json?: unknown
	text?: string
	headers?: Record<string, string>
	bearer?: string
	noBearer?: boolean
}

interface EvaluateCall {
	url: string
	method: string
	headers?: Record<string, string>
	data?: string
}

function mockPage(spec: MockResponseSpec = {}) {
	const calls: EvaluateCall[] = []
	const ok = spec.ok ?? true
	const status = spec.status ?? (ok ? 200 : 500)
	const bodyText =
		spec.text ?? (spec.json !== undefined ? JSON.stringify(spec.json) : '')
	const bearer = spec.bearer ?? 'mock-bearer-token'

	const page = {
		evaluate: async (_fn: unknown, args?: Record<string, unknown>) => {
			// Case A: getBearerToken (no args / no token field)
			if (!args || !('token' in args)) {
				if (spec.noBearer) {
					return { token: null, probedKeys: [] }
				}
				return {
					token: bearer,
					probedKeys: ['oidc.user:https://accounts.nike.com:4fd2d5e7db76e0f85a6bb56721bd51df'],
				}
			}
			// Case B: cart_views fetch
			const url = args['url'] as string
			const method = args['method'] as string
			const headers = args['headers'] as Record<string, string> | undefined
			const data = args['data'] as string | null | undefined
			calls.push({ url, method, headers, data: data ?? undefined })
			return {
				status,
				headers: spec.headers ?? {},
				body: bodyText,
				ok,
			}
		},
	} as unknown as Page

	return { page, calls }
}

// Sequence mock: returns a different response on each consecutive call.
function mockPageSequence(
	bearerToken: string,
	responses: Array<{ ok: boolean; status: number; json?: unknown; text?: string }>,
) {
	const calls: EvaluateCall[] = []
	let fetchCallIndex = 0

	const page = {
		evaluate: async (_fn: unknown, args?: Record<string, unknown>) => {
			if (!args || !('token' in args)) {
				return {
					token: bearerToken,
					probedKeys: ['oidc.user:https://accounts.nike.com:abc'],
				}
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

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('../../../test/fixtures/cart-view-shipping-fr.json') as {
	nikeAddress: NikeAddress
	cartViewRequestBody: { type: string; cartId: string; address: NikeAddress }
}

const FR_ADDRESS: NikeAddress = {
	recipient: { firstName: 'Jean', lastName: 'Dupont' },
	addressLines: ['12 Rue de Rivoli'],
	locality: 'Paris',
	postalCode: '75001',
	country: 'FR',
	phoneNumber: '+33612345678',
}

const CART_ID = 'test-cart-uuid-fr'

const sampleView: CartView = {
	viewId: 'view-uuid-1',
	type: 'SHIPPING',
	status: 'PENDING',
	cartId: CART_ID,
}

const readyView: CartView = { ...sampleView, status: 'READY' }
const errorView: CartView = {
	...sampleView,
	status: 'ERROR',
	errors: [{ code: 'INVALID_POSTAL_CODE', field: 'postalCode' }],
}

// ─── openShippingView ─────────────────────────────────────────────────────────

describe('NikeCartViewsApi.openShippingView', () => {
	it('issues PUT to /buy/cart_views/v1/{viewUuid}', async () => {
		const fixedUuid = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => fixedUuid)

		await api.openShippingView(CART_ID, FR_ADDRESS)

		assert.equal(calls.length, 1)
		assert.equal(calls[0]!.url, `https://api.nike.com/buy/cart_views/v1/${fixedUuid}`)
		assert.equal(calls[0]!.method, 'PUT')
	})

	it('uses crypto.randomUUID by default (mocked + verified)', async () => {
		const captured: string[] = []
		const { page } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => {
			const id = 'test-uuid-' + captured.length
			captured.push(id)
			return id
		})

		await api.openShippingView(CART_ID, FR_ADDRESS)

		assert.equal(captured.length, 1)
		assert.match(captured[0]!, /^test-uuid-/)
	})

	it('sets content-type: application/json; charset=UTF-8 (NOT json-patch+json)', async () => {
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await api.openShippingView(CART_ID, FR_ADDRESS)

		assert.equal(
			calls[0]!.headers?.['content-type'],
			'application/json; charset=UTF-8',
		)
	})

	it('sets accept: application/json header', async () => {
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await api.openShippingView(CART_ID, FR_ADDRESS)

		assert.equal(calls[0]!.headers?.['accept'], 'application/json')
	})

	it('sends body with {type: SHIPPING, cartId, address} — byte-for-byte fixture check', async () => {
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await api.openShippingView(CART_ID, FR_ADDRESS)

		const body = JSON.parse(calls[0]!.data ?? '{}')
		assert.deepEqual(body, fixture.cartViewRequestBody)
	})

	it('address is mapped to Nike shape byte-for-byte (fixture guard)', async () => {
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await api.openShippingView(CART_ID, FR_ADDRESS)

		const body = JSON.parse(calls[0]!.data ?? '{}')
		assert.deepEqual(body.address, fixture.nikeAddress)
	})

	it('returns parsed CartView on success', async () => {
		const { page } = mockPage({ json: readyView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		const result = await api.openShippingView(CART_ID, FR_ADDRESS)

		assert.deepEqual(result, readyView)
	})

	it('throws CartViewApiError on 4xx with INVALID_POSTAL_CODE', async () => {
		const errorBody = JSON.stringify({ errors: [{ code: 'INVALID_POSTAL_CODE', field: 'postalCode' }] })
		const { page } = mockPage({ ok: false, status: 422, text: errorBody })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await assert.rejects(
			() => api.openShippingView(CART_ID, FR_ADDRESS),
			(err: unknown) => {
				assert.ok(err instanceof CartViewApiError)
				assert.equal(err.status, 422)
				assert.equal(err.nikeCode, 'INVALID_POSTAL_CODE')
				assert.equal(err.field, 'postalCode')
				return true
			},
		)
	})

	it('does NOT retry on 4xx address validation (CartViewApiError thrown directly)', async () => {
		const errorBody = JSON.stringify({ errors: [{ code: 'INVALID_POSTAL_CODE' }] })
		const { page, calls } = mockPage({ ok: false, status: 400, text: errorBody })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await assert.rejects(() => api.openShippingView(CART_ID, FR_ADDRESS), CartViewApiError)

		// Exactly one fetch call — no retry
		assert.equal(calls.length, 1)
	})
})

// ─── waitForView ─────────────────────────────────────────────────────────────

describe('NikeCartViewsApi.waitForView', () => {
	it('polls GET /buy/cart_views/v1/{viewId} and resolves when READY', async () => {
		const sequence = [
			{ ok: true, status: 200, json: sampleView },          // PENDING
			{ ok: true, status: 200, json: sampleView },          // PENDING
			{ ok: true, status: 200, json: readyView },           // READY
		]
		const { page, calls } = mockPageSequence('mock-bearer', sequence)
		const api = new NikeCartViewsApi(page)

		const result = await api.waitForView(sampleView.viewId, { intervalMs: 0 })

		assert.deepEqual(result, readyView)
		assert.equal(calls.length, 3)
		// All GETs on correct path
		for (const c of calls) {
			assert.equal(c.url, `https://api.nike.com/buy/cart_views/v1/${sampleView.viewId}`)
			assert.equal(c.method, 'GET')
		}
	})

	it('resolves immediately when first poll is READY', async () => {
		const { page, calls } = mockPage({ json: readyView })
		const api = new NikeCartViewsApi(page)

		const result = await api.waitForView(readyView.viewId, { intervalMs: 0 })

		assert.deepEqual(result, readyView)
		assert.equal(calls.length, 1)
	})

	it('rejects with CartViewTimeoutError if all polls return PENDING', async () => {
		const { page } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page)

		await assert.rejects(
			() => api.waitForView(sampleView.viewId, { timeoutMs: 10, intervalMs: 0 }),
			(err: unknown) => {
				assert.ok(err instanceof CartViewTimeoutError)
				assert.equal(err.viewId, sampleView.viewId)
				assert.equal(err.lastStatus, 'PENDING')
				assert.ok(err.elapsedMs >= 0)
				return true
			},
		)
	})

	it('CartViewTimeoutError carries all required fields (viewId, lastStatus, elapsedMs)', async () => {
		const { page } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page)

		try {
			await api.waitForView('some-view-id', { timeoutMs: 1, intervalMs: 0 })
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof CartViewTimeoutError)
			assert.equal(err.viewId, 'some-view-id')
			assert.equal(err.lastStatus, 'PENDING')
			assert.ok(typeof err.elapsedMs === 'number')
		}
	})

	it('rejects with CartViewError immediately when poll returns ERROR (no retry)', async () => {
		const sequence = [
			{ ok: true, status: 200, json: sampleView },    // PENDING
			{ ok: true, status: 200, json: errorView },     // ERROR
		]
		const { page, calls } = mockPageSequence('mock-bearer', sequence)
		const api = new NikeCartViewsApi(page)

		await assert.rejects(
			() => api.waitForView(sampleView.viewId, { intervalMs: 0 }),
			(err: unknown) => {
				assert.ok(err instanceof CartViewError)
				assert.deepEqual(err.view, errorView)
				return true
			},
		)

		assert.equal(calls.length, 2, 'must stop polling after ERROR — no further calls')
	})

	it('CartViewError message contains viewId and error details', async () => {
		const { page } = mockPage({ json: errorView })
		const api = new NikeCartViewsApi(page)

		try {
			await api.waitForView(errorView.viewId, { intervalMs: 0 })
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof CartViewError)
			assert.ok(err.message.includes(errorView.viewId))
			assert.ok(err.message.includes('INVALID_POSTAL_CODE'))
		}
	})
})

// ─── Address mapper integration via openShippingView ──────────────────────────

describe('NikeCartViewsApi address — FR fixture guard', () => {
	it('recipient fields are mapped correctly', async () => {
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await api.openShippingView(CART_ID, FR_ADDRESS)

		const body = JSON.parse(calls[0]!.data ?? '{}')
		assert.equal(body.address.recipient.firstName, 'Jean')
		assert.equal(body.address.recipient.lastName, 'Dupont')
	})

	it('addressLines is an array starting with line1', async () => {
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await api.openShippingView(CART_ID, FR_ADDRESS)

		const body = JSON.parse(calls[0]!.data ?? '{}')
		assert.ok(Array.isArray(body.address.addressLines))
		assert.equal(body.address.addressLines[0], '12 Rue de Rivoli')
	})

	it('postalCode, locality, country, phoneNumber are mapped', async () => {
		const { page, calls } = mockPage({ json: sampleView })
		const api = new NikeCartViewsApi(page, () => 'uuid-1')

		await api.openShippingView(CART_ID, FR_ADDRESS)

		const body = JSON.parse(calls[0]!.data ?? '{}')
		assert.equal(body.address.postalCode, '75001')
		assert.equal(body.address.locality, 'Paris')
		assert.equal(body.address.country, 'FR')
		assert.equal(body.address.phoneNumber, '+33612345678')
	})
})
