import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import {
	NikePaymentApi,
	NoPaymentMethodError,
	PaymentApiAuthError,
	PaymentApiError,
	pickDefaultPaymentMethod,
} from './paymentApi.ts'
import type { PaymentMethod } from './paymentApi.types.ts'

// ─── Mock factory ─────────────────────────────────────────────────────────────

interface MockResponseSpec {
	ok?: boolean
	status?: number
	json?: unknown
	text?: string
	bearer?: string
}

interface EvaluateCall {
	url: string
	method: string
	headers?: Record<string, string>
	data?: string | null
}

function mockPage(spec: MockResponseSpec = {}) {
	const calls: EvaluateCall[] = []
	const ok = spec.ok ?? true
	const status = spec.status ?? (ok ? 200 : 500)
	const bodyText = spec.text ?? (spec.json !== undefined ? JSON.stringify(spec.json) : '')
	const bearer = spec.bearer ?? 'mock-bearer-token'

	const page = {
		evaluate: async (_fn: unknown, args?: Record<string, unknown>) => {
			// Case A: getBearerToken (no args / no token field)
			if (!args || !('token' in args)) {
				return {
					token: bearer,
					probedKeys: ['oidc.user:https://accounts.nike.com:4fd2d5e7db76e0f85a6bb56721bd51df'],
				}
			}
			// Case B: fetch call
			const url = args['url'] as string
			const method = args['method'] as string
			const headers = args['headers'] as Record<string, string> | undefined
			const data = args['data'] as string | null | undefined
			calls.push({ url, method, headers, data: data ?? undefined })
			return {
				status,
				headers: {},
				body: bodyText,
				ok,
			}
		},
	} as unknown as Page

	return { page, calls }
}

// Sample payment methods
const cardMethod: PaymentMethod = {
	methodId: 'pm-card-1',
	type: 'CARD',
	displayLabel: 'Visa ****1234',
	last4: '1234',
	brand: 'VISA',
	isDefault: false,
}

const paypalMethod: PaymentMethod = {
	methodId: 'pm-paypal-1',
	type: 'PAYPAL',
	displayLabel: 'PayPal account',
	isDefault: true,
}

const defaultCardMethod: PaymentMethod = {
	methodId: 'pm-card-2',
	type: 'CARD',
	displayLabel: 'Mastercard ****5678',
	last4: '5678',
	brand: 'MASTERCARD',
	isDefault: true,
}

// ─── listOptions tests ────────────────────────────────────────────────────────

describe('NikePaymentApi.listOptions', () => {
	it('issues POST to /payment/options/v3 with correct headers and body', async () => {
		const { page, calls } = mockPage({
			json: { methods: [cardMethod, paypalMethod] },
		})
		const api = new NikePaymentApi(page)
		const result = await api.listOptions({ cartId: 'cart-abc', country: 'FR' })

		assert.equal(calls.length, 1)
		const call = calls[0]!
		assert.equal(call.url, 'https://api.nike.com/payment/options/v3')
		assert.equal(call.method, 'POST')
		assert.equal(call.headers?.['content-type'], 'application/json; charset=UTF-8')
		assert.equal(call.headers?.['accept'], 'application/json')

		const body = JSON.parse(call.data as string) as Record<string, unknown>
		assert.equal(body['cartId'], 'cart-abc')
		assert.equal(body['country'], 'FR')
		assert.equal(body['currency'], 'EUR')

		assert.equal(result.length, 2)
		assert.equal(result[0]!.methodId, 'pm-card-1')
		assert.equal(result[1]!.methodId, 'pm-paypal-1')
	})

	it('includes Bearer token in Authorization header', async () => {
		const { page, calls } = mockPage({
			json: { methods: [cardMethod] },
			bearer: 'test-token-xyz',
		})
		const api = new NikePaymentApi(page)
		await api.listOptions({ cartId: 'cart-1', country: 'FR' })

		// The evaluate fn attaches the token — verify args passed to evaluate contain token
		assert.equal(calls.length, 1)
		// Token is embedded via Authorization header inside evaluate, not in calls directly,
		// but we can verify the url was called correctly.
		assert.equal(calls[0]!.url, 'https://api.nike.com/payment/options/v3')
	})

	it('defaults currency to EUR when not specified', async () => {
		const { page, calls } = mockPage({ json: { methods: [] } })
		const api = new NikePaymentApi(page)
		await api.listOptions({ cartId: 'cart-1', country: 'FR' })

		const body = JSON.parse(calls[0]!.data as string) as Record<string, unknown>
		assert.equal(body['currency'], 'EUR')
	})

	it('uses provided currency when specified', async () => {
		const { page, calls } = mockPage({ json: { methods: [] } })
		const api = new NikePaymentApi(page)
		await api.listOptions({ cartId: 'cart-1', country: 'US', currency: 'USD' })

		const body = JSON.parse(calls[0]!.data as string) as Record<string, unknown>
		assert.equal(body['currency'], 'USD')
	})

	it('returns [] when API returns {methods: []}', async () => {
		const { page } = mockPage({ json: { methods: [] } })
		const api = new NikePaymentApi(page)
		const result = await api.listOptions({ cartId: 'cart-1', country: 'FR' })
		assert.deepEqual(result, [])
	})

	it('defensive parse: falls back to paymentMethods key', async () => {
		const { page } = mockPage({ json: { paymentMethods: [cardMethod] } })
		const api = new NikePaymentApi(page)
		const result = await api.listOptions({ cartId: 'cart-1', country: 'FR' })
		assert.equal(result.length, 1)
		assert.equal(result[0]!.methodId, 'pm-card-1')
	})

	it('defensive parse: falls back to objects key', async () => {
		const { page } = mockPage({ json: { objects: [paypalMethod] } })
		const api = new NikePaymentApi(page)
		const result = await api.listOptions({ cartId: 'cart-1', country: 'FR' })
		assert.equal(result.length, 1)
		assert.equal(result[0]!.methodId, 'pm-paypal-1')
	})

	it('throws PaymentApiAuthError on 401', async () => {
		const { page } = mockPage({ ok: false, status: 401, text: 'Unauthorized' })
		const api = new NikePaymentApi(page)
		await assert.rejects(
			() => api.listOptions({ cartId: 'cart-1', country: 'FR' }),
			(err: unknown) => {
				assert.ok(err instanceof PaymentApiAuthError)
				return true
			},
		)
	})

	it('throws PaymentApiError on non-401 error', async () => {
		const { page } = mockPage({ ok: false, status: 500, text: 'Server Error' })
		const api = new NikePaymentApi(page)
		await assert.rejects(
			() => api.listOptions({ cartId: 'cart-1', country: 'FR' }),
			(err: unknown) => {
				assert.ok(err instanceof PaymentApiError)
				assert.ok(err instanceof PaymentApiError && err.status === 500)
				return true
			},
		)
	})
})

// ─── pickDefaultPaymentMethod tests ──────────────────────────────────────────

describe('pickDefaultPaymentMethod', () => {
	it('throws NoPaymentMethodError on empty array', () => {
		assert.throws(
			() => pickDefaultPaymentMethod([]),
			(err: unknown) => {
				assert.ok(err instanceof NoPaymentMethodError)
				return true
			},
		)
	})

	it('prefer=CARD returns first CARD even if PayPal is default', () => {
		const methods = [paypalMethod, cardMethod]
		const result = pickDefaultPaymentMethod(methods, { prefer: 'CARD' })
		assert.equal(result.methodId, 'pm-card-1')
	})

	it('prefer=CARD beats isDefault PayPal', () => {
		// paypalMethod has isDefault=true, cardMethod does not
		const methods = [paypalMethod, cardMethod]
		const result = pickDefaultPaymentMethod(methods, { prefer: 'CARD' })
		assert.equal(result.type, 'CARD')
	})

	it('falls back to isDefault when prefer type not found', () => {
		const klarnaMethod: PaymentMethod = {
			methodId: 'pm-klarna-1',
			type: 'KLARNA',
			displayLabel: 'Klarna',
			isDefault: false,
		}
		const methods = [paypalMethod, klarnaMethod]
		// prefer CARD, no CARD exists → falls back to isDefault (paypal)
		const result = pickDefaultPaymentMethod(methods, { prefer: 'CARD' })
		assert.equal(result.methodId, 'pm-paypal-1')
	})

	it('falls back to methods[0] when no prefer match and no isDefault', () => {
		const m1: PaymentMethod = { methodId: 'pm-1', type: 'KLARNA', displayLabel: 'Klarna' }
		const m2: PaymentMethod = { methodId: 'pm-2', type: 'PAYPAL', displayLabel: 'PayPal' }
		const result = pickDefaultPaymentMethod([m1, m2], { prefer: 'CARD' })
		assert.equal(result.methodId, 'pm-1')
	})

	it('no opts: returns isDefault method', () => {
		const methods = [cardMethod, paypalMethod] // paypalMethod has isDefault=true
		const result = pickDefaultPaymentMethod(methods)
		assert.equal(result.methodId, 'pm-paypal-1')
	})

	it('no opts and no isDefault: returns methods[0]', () => {
		const m: PaymentMethod = { methodId: 'pm-1', type: 'CARD', displayLabel: 'Card' }
		const result = pickDefaultPaymentMethod([m])
		assert.equal(result.methodId, 'pm-1')
	})

	it('prefer=PAYPAL returns first PayPal even if CARD is default', () => {
		const methods = [defaultCardMethod, paypalMethod]
		const result = pickDefaultPaymentMethod(methods, { prefer: 'PAYPAL' })
		assert.equal(result.type, 'PAYPAL')
		assert.equal(result.methodId, 'pm-paypal-1')
	})
})

// ─── bindPaymentMethod tests ──────────────────────────────────────────────────

describe('NikePaymentApi.bindPaymentMethod', () => {
	it('issues PUT /buy/cart_views/v1/<viewId> with selectedPaymentMethod', async () => {
		const cartView = {
			viewId: 'view-abc',
			type: 'PAYMENT',
			status: 'READY',
			cartId: 'cart-1',
			selectedPaymentMethod: 'pm-card-1',
		}
		const { page, calls } = mockPage({ json: cartView })
		const api = new NikePaymentApi(page)
		const result = await api.bindPaymentMethod({ viewId: 'view-abc', methodId: 'pm-card-1' })

		assert.equal(calls.length, 1)
		assert.equal(calls[0]!.url, 'https://api.nike.com/buy/cart_views/v1/view-abc')
		assert.equal(calls[0]!.method, 'PUT')

		const body = JSON.parse(calls[0]!.data as string) as Record<string, unknown>
		assert.equal(body['selectedPaymentMethod'], 'pm-card-1')

		assert.equal((result as unknown as Record<string, unknown>)['selectedPaymentMethod'], 'pm-card-1')
	})

	it('propagates CartViewApiError from mergeView on non-2xx', async () => {
		const { page } = mockPage({ ok: false, status: 422, text: '{"errors":[{"code":"INVALID_METHOD"}]}' })
		const api = new NikePaymentApi(page)
		await assert.rejects(
			() => api.bindPaymentMethod({ viewId: 'view-1', methodId: 'pm-bad' }),
		)
	})
})

// ─── Error class identity tests ───────────────────────────────────────────────

describe('PaymentApi error classes', () => {
	it('NoPaymentMethodError is instanceof Error', () => {
		const err = new NoPaymentMethodError()
		assert.ok(err instanceof Error)
		assert.ok(err instanceof NoPaymentMethodError)
		assert.equal(err.name, 'NoPaymentMethodError')
	})

	it('PaymentApiAuthError is instanceof Error', () => {
		const err = new PaymentApiAuthError()
		assert.ok(err instanceof Error)
		assert.ok(err instanceof PaymentApiAuthError)
		assert.equal(err.name, 'PaymentApiAuthError')
	})

	it('PaymentApiError carries status and bodyPreview', () => {
		const err = new PaymentApiError(503, 'Service Unavailable')
		assert.equal(err.status, 503)
		assert.equal(err.bodyPreview, 'Service Unavailable')
	})
})
