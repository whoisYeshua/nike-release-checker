import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import { NikeCartApi, NikeCartApiError, UnknownCountryError } from './cartApi.ts'
import { cartEndpoints } from './endpoints.ts'
import { countryRegistry } from '../../country/registry.ts'
import { generateVisitorId } from './visitorId.ts'
import type { Cart } from './cartApi.types.ts'
import { SessionExpiredError } from './apiErrors.ts'

interface MockResponseSpec {
	ok?: boolean
	status?: number
	json?: unknown
	text?: string
	headers?: Record<string, string>
	/** Bearer token to return from localStorage mock. Defaults to 'mock-bearer-token'. */
	bearer?: string
	/** If true, simulate no OIDC token in localStorage (getBearerToken throws). */
	noBearer?: boolean
}

interface FetchCall {
	url: string
	method: string
	headers?: Record<string, string>
	data?: string
}

/**
 * mockPage creates a fake Playwright Page whose page.evaluate() handles two cases:
 *
 *  (A) localStorage read (getBearerToken):
 *      The evaluate callback is called WITHOUT a second serialised-args argument
 *      (or the args object has no `token` field). We return a fake localStorage
 *      result with a valid OIDC token unless spec.noBearer is set.
 *
 *  (B) Cart fetch (request<T>):
 *      The evaluate callback is called WITH args: { url, method, headers, data, token }.
 *      We record the call and return { status, headers, body, ok } mirroring the
 *      browser-side fetch response shape the production code expects.
 *
 * All 27 existing assertions about request shape (URL / method / headers / body)
 * are preserved — only the mock wiring shifts from page.request.fetch to page.evaluate.
 */
function mockPage(spec: MockResponseSpec = {}) {
	const calls: FetchCall[] = []
	const ok = spec.ok ?? true
	const status = spec.status ?? (ok ? 200 : 500)
	// On success, body must be the JSON-encoded payload because the production
	// code JSON.parses the body string received from page.evaluate.
	const bodyText =
		spec.text ?? (spec.json !== undefined ? JSON.stringify(spec.json) : '')
	const bearer = spec.bearer ?? 'mock-bearer-token'

	const page = {
		evaluate: async (
			_fn: unknown,
			args?: Record<string, unknown>,
		) => {
			// Case A: getBearerToken — no args or args has no `token` field
			if (!args || !('token' in args)) {
				if (spec.noBearer) {
					// Simulate localStorage with no oidc.user:* keys
					return { token: null, probedKeys: [] }
				}
				// Simulate localStorage with a valid OIDC token
				return {
					token: bearer,
					probedKeys: ['oidc.user:https://accounts.nike.com:4fd2d5e7db76e0f85a6bb56721bd51df'],
				}
			}

			// Case B: cart fetch — args has { url, method, headers, data, token }
			const url = args['url'] as string
			const method = args['method'] as string
			const headers = args['headers'] as Record<string, string> | undefined
			const data = args['data'] as string | null | undefined
			calls.push({
				url,
				method,
				headers,
				data: data ?? undefined,
			})
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

const sampleCart: Cart = {
	id: 'cart-1',
	country: 'FR',
	currency: 'EUR',
	items: [],
	totals: { subtotal: 0, total: 0, currency: 'EUR' },
}

const FR_PATCH_PATH =
	'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY'
const FR_GET_PATH = 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM'

describe('NikeCartApi.initVisitor', () => {
	it('issues PATCH with merge op and visitorId payload', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		const result = await api.initVisitor('v-uuid')

		assert.equal(calls.length, 1)
		assert.equal(calls[0]!.url, FR_PATCH_PATH)
		assert.equal(calls[0]!.method, 'PATCH')
		assert.equal(
			calls[0]!.headers?.['content-type'],
			'application/json; charset=UTF-8',
		)
		const body = JSON.parse(calls[0]!.data ?? '[]')
		assert.deepEqual(body, [
			{ op: 'merge', path: '/', value: { visitorId: 'v-uuid' } },
		])
		assert.deepEqual(result, sampleCart)
	})

	it('PATCH URL always carries the ?modifiers= query (regression guard)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)
		await api.initVisitor('v')
		assert.match(
			calls[0]!.url,
			/\?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY$/,
		)
	})
})

describe('NikeCartApi.addItem', () => {
	it('issues PATCH with add op and itemData URL derived from slug + styleColor', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.addItem('SKU-1', 'air-max-jBrhdR', 'CW2288-111')

		const body = JSON.parse(calls[0]!.data ?? '[]')
		assert.deepEqual(body, [
			{
				op: 'add',
				path: '/items',
				value: {
					itemData: { url: '/fr/t/air-max-jBrhdR/CW2288-111' },
					skuId: 'SKU-1',
					quantity: 1,
				},
			},
		])
	})

	it('passes explicit quantity through unchanged', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.addItem('SKU-1', 'slug', 'styleColor', 3)

		const body = JSON.parse(calls[0]!.data ?? '[]')
		assert.equal(body[0].value.quantity, 3)
	})

	it('throws synchronously when slug is empty (AC5 "missing slug" branch)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await assert.rejects(
			() => api.addItem('SKU', '', 'CW2288-111'),
			/slug and styleColor are required/,
		)
		assert.equal(calls.length, 0, 'no fetch should have been issued')
	})

	it('throws synchronously when styleColor is empty', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await assert.rejects(
			() => api.addItem('SKU', 'slug', ''),
			/slug and styleColor are required/,
		)
		assert.equal(calls.length, 0)
	})

	it('pins content-type to application/json', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)
		await api.addItem('SKU', 'slug', 'sc')
		assert.equal(
			calls[0]!.headers?.['content-type'],
			'application/json; charset=UTF-8',
		)
	})
})

describe('NikeCartApi.getCart', () => {
	it('issues GET against the bare cart path (no modifiers query)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.getCart()

		assert.equal(calls[0]!.method, 'GET')
		assert.equal(calls[0]!.url, FR_GET_PATH)
		assert.equal(calls[0]!.data, undefined)
	})
})

describe('NikeCartApi.removeItem', () => {
	it('issues PATCH with remove op at /items and value:{id} (Story 12.11 contract)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.removeItem('item-42')

		const body = JSON.parse(calls[0]!.data ?? '[]')
		// Story 12.11 live-confirmed contract (2026-04-25):
		// Nike uses non-standard JSON Patch shape — path targets the collection (/items)
		// and value carries the selector {id}. All RFC 6902-conformant shapes rejected.
		assert.deepEqual(body, [
			{ op: 'remove', path: '/items', value: { id: 'item-42' } },
		])
	})

	it('does NOT escape the itemId into the path (id goes in value.id)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.removeItem('a~b/c')

		const body = JSON.parse(calls[0]!.data ?? '[]')
		// path is always /items — the id is in value.id, unescaped
		assert.equal(body[0].path, '/items')
		assert.equal(body[0].value.id, 'a~b/c')
	})

	it('pins content-type to application/json', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)
		await api.removeItem('id')
		assert.equal(
			calls[0]!.headers?.['content-type'],
			'application/json; charset=UTF-8',
		)
	})
})

describe('NikeCartApi.setQuantity', () => {
	it('issues PATCH with replace op at /items and value:{id,skuId,quantity} (Story 12.11 contract)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.setQuantity('item-7', 'sku-abc', 2)

		const body = JSON.parse(calls[0]!.data ?? '[]')
		// Story 12.11 live-confirmed contract (2026-04-25):
		// Nike uses non-standard JSON Patch shape — path targets the collection (/items),
		// value carries selector (id) + skuId + quantity. skuId is required.
		assert.deepEqual(body, [
			{ op: 'replace', path: '/items', value: { id: 'item-7', skuId: 'sku-abc', quantity: 2 } },
		])
	})

	it('still issues replace (NOT remove) when quantity is 0', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.setQuantity('item-7', 'sku-abc', 0)

		const body = JSON.parse(calls[0]!.data ?? '[]')
		assert.equal(body[0].op, 'replace')
		assert.equal(body[0].value.quantity, 0)
	})

	it('does NOT escape the itemId into the path (id goes in value.id)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)

		await api.setQuantity('a/b~c', 'sku-xyz', 5)

		const body = JSON.parse(calls[0]!.data ?? '[]')
		// path is always /items — id is in value.id, unescaped
		assert.equal(body[0].path, '/items')
		assert.equal(body[0].value.id, 'a/b~c')
		assert.equal(body[0].value.skuId, 'sku-xyz')
		assert.equal(body[0].value.quantity, 5)
	})

	it('pins content-type to application/json', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page)
		await api.setQuantity('id', 'sku', 1)
		assert.equal(
			calls[0]!.headers?.['content-type'],
			'application/json; charset=UTF-8',
		)
	})
})

describe('NikeCartApi multi-country', () => {
	it('honours non-FR market in PATCH path', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page, 'US')

		await api.initVisitor('v')

		assert.equal(
			calls[0]!.url,
			'https://api.nike.com/buy/carts/v2/US/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY',
		)
	})

	it('honours non-FR market in GET path', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page, 'DE')

		await api.getCart()

		assert.equal(
			calls[0]!.url,
			'https://api.nike.com/buy/carts/v2/DE/NIKE/NIKECOM',
		)
	})
})

describe('NikeCartApi error handling', () => {
	it('throws NikeCartApiError on 403 with status, method, path', async () => {
		const { page } = mockPage({
			ok: false,
			status: 403,
			text: 'Forbidden',
			headers: { 'x-akamai-request-id': 'akm-1' },
		})
		const api = new NikeCartApi(page)

		await assert.rejects(
			() => api.initVisitor('v'),
			(err: unknown) => {
				assert.ok(err instanceof NikeCartApiError)
				assert.equal(err.status, 403)
				assert.equal(err.method, 'PATCH')
				assert.ok(err.path.startsWith('/buy/carts/v2/FR/'))
				return true
			},
		)
	})

	it('throws NikeCartApiError on 404', async () => {
		const { page } = mockPage({ ok: false, status: 404, text: 'not found' })
		const api = new NikeCartApi(page)
		await assert.rejects(() => api.getCart(), NikeCartApiError)
	})

	it('throws NikeCartApiError on 500', async () => {
		const { page } = mockPage({ ok: false, status: 500, text: 'oops' })
		const api = new NikeCartApi(page)
		await assert.rejects(() => api.removeItem('i'), NikeCartApiError)
	})

	it('truncates bodyPreview to 256 chars', async () => {
		const longBody = 'a'.repeat(1000)
		const { page } = mockPage({ ok: false, status: 500, text: longBody })
		const api = new NikeCartApi(page)

		try {
			await api.initVisitor('v')
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof NikeCartApiError)
			assert.equal(err.bodyPreview.length, 256)
		}
	})

	it('redacts headers — only x-akamai-request-id and x-kpsdk-st surface', async () => {
		const { page } = mockPage({
			ok: false,
			status: 403,
			text: 'blocked',
			headers: {
				'x-akamai-request-id': 'akm-1',
				'x-kpsdk-st': 'kp-1',
				'set-cookie': 'sid=SECRET; Path=/',
				authorization: 'Bearer SECRET',
				sid: 'SECRET',
			},
		})
		const api = new NikeCartApi(page)

		try {
			await api.initVisitor('v')
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof NikeCartApiError)
			assert.equal(err.headers['x-akamai-request-id'], 'akm-1')
			assert.equal(err.headers['x-kpsdk-st'], 'kp-1')
			// Redaction: forbidden headers must not appear on the error
			const headerKeys = Object.keys(err.headers)
			assert.deepEqual(headerKeys.sort(), [
				'x-akamai-request-id',
				'x-kpsdk-st',
			])
			const serialized = JSON.stringify(err.headers)
			assert.equal(serialized.includes('SECRET'), false)
			assert.equal(serialized.includes('set-cookie'), false)
			assert.equal(serialized.includes('authorization'), false)
		}
	})

	it('lower-cases header keys before extraction (mixed-case input)', async () => {
		const { page } = mockPage({
			ok: false,
			status: 403,
			text: 'x',
			headers: { 'X-Akamai-Request-Id': 'akm', 'X-KPSDK-ST': 'kp' },
		})
		const api = new NikeCartApi(page)
		try {
			await api.initVisitor('v')
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof NikeCartApiError)
			assert.equal(err.headers['x-akamai-request-id'], 'akm')
			assert.equal(err.headers['x-kpsdk-st'], 'kp')
		}
	})

	it('handles missing diagnostic headers (both undefined)', async () => {
		const { page } = mockPage({
			ok: false,
			status: 500,
			text: 'err',
			headers: {},
		})
		const api = new NikeCartApi(page)

		try {
			await api.initVisitor('v')
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof NikeCartApiError)
			assert.equal(err.headers['x-akamai-request-id'], undefined)
			assert.equal(err.headers['x-kpsdk-st'], undefined)
		}
	})

	it('throws NikeCartApiError when 200 body is non-JSON (HTML interstitial)', async () => {
		const { page } = mockPage({
			ok: true,
			status: 200,
			text: '<html>Akamai challenge</html>',
		})
		const api = new NikeCartApi(page)

		await assert.rejects(
			() => api.getCart(),
			(err: unknown) => {
				assert.ok(err instanceof NikeCartApiError)
				assert.equal(err.status, 200)
				assert.ok(err.bodyPreview.includes('Akamai challenge'))
				return true
			},
		)
	})
})

describe('generateVisitorId', () => {
	it('returns a valid UUID v4 string', () => {
		const id = generateVisitorId()
		assert.match(
			id,
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		)
	})

	it('returns unique IDs across calls', () => {
		const a = generateVisitorId()
		const b = generateVisitorId()
		assert.notEqual(a, b)
	})
})

// ---------------------------------------------------------------------------
// New tests for Story 12.10: page.evaluate transport + Bearer injection
// ---------------------------------------------------------------------------

describe('NikeCartApi transport — Bearer injection (Story 12.10)', () => {
	it('injects Authorization: Bearer header into evaluate args', async () => {
		// We need to capture the args passed to the evaluate callback.
		// Use a custom page mock that records evaluate call args.
		const capturedArgs: unknown[] = []
		const customPage = {
			evaluate: async (_fn: unknown, args?: unknown) => {
				capturedArgs.push(args)
				if (!args || typeof args !== 'object' || !('token' in (args as Record<string, unknown>))) {
					// getBearerToken call
					return {
						token: 'test-bearer-xyz',
						probedKeys: ['oidc.user:https://accounts.nike.com:abc123'],
					}
				}
				// cart fetch call
				void (args as { url: string; method: string; headers: Record<string, string>; data: string | null; token: string })
				return {
					status: 200,
					headers: {},
					body: JSON.stringify({ id: 'c1', country: 'FR', currency: 'EUR', items: [], totals: { subtotal: 0, total: 0, currency: 'EUR' } }),
					ok: true,
				}
			},
		} as unknown as Page

		const api = new NikeCartApi(customPage)
		await api.getCart()

		// The second captured arg (index 1) should be the cart fetch args
		const fetchArgs = capturedArgs[1] as { token: string; headers: Record<string, string> } | undefined
		assert.ok(fetchArgs, 'fetch args should be captured')
		assert.equal(fetchArgs.token, 'test-bearer-xyz')
	})

	it('throws SessionExpiredError and issues NO fetch when no OIDC token', async () => {
		const { page, calls } = mockPage({ json: { id: 'c1', country: 'FR', currency: 'EUR', items: [], totals: { subtotal: 0, total: 0, currency: 'EUR' } }, noBearer: true })
		const api = new NikeCartApi(page)

		await assert.rejects(
			() => api.initVisitor('v-test'),
			(err: unknown) => {
				assert.ok(err instanceof SessionExpiredError)
				assert.match(err.message, /getBearerToken/)
				return true
			},
		)
		// No cart fetch should have been issued
		assert.equal(calls.length, 0, 'no fetch should be issued when bearer is missing')
	})

	it('throws NikeCartApiError (not SessionExpiredError) when evaluate returns non-2xx', async () => {
		const { page } = mockPage({
			ok: false,
			status: 403,
			text: 'Forbidden',
			headers: { 'x-akamai-request-id': 'akm-403' },
		})
		const api = new NikeCartApi(page)

		await assert.rejects(
			() => api.getCart(),
			(err: unknown) => {
				assert.ok(err instanceof NikeCartApiError)
				assert.equal(err.status, 403)
				return true
			},
		)
	})

	it('throws NikeCartApiError when 200 body is non-JSON (regression guard 12.1)', async () => {
		const { page } = mockPage({
			ok: true,
			status: 200,
			text: '<html>Bot detection interstitial</html>',
		})
		const api = new NikeCartApi(page)

		await assert.rejects(
			() => api.getCart(),
			(err: unknown) => {
				assert.ok(err instanceof NikeCartApiError)
				assert.equal(err.status, 200)
				assert.ok(err.bodyPreview.includes('interstitial'))
				return true
			},
		)
	})
})

// ---------------------------------------------------------------------------
// Story 13.2: per-country cart endpoint parameterization
// ---------------------------------------------------------------------------

describe('cartEndpoints — URL builders (Story 13.2)', () => {
	const FR = countryRegistry.get('FR')
	const US = countryRegistry.get('US')

	it('cartEndpoints.cart(FR) resolves to the expected FR path', () => {
		assert.equal(
			cartEndpoints.cart(FR),
			'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY',
		)
	})

	it('cartEndpoints.cart(US) resolves to the expected US path', () => {
		assert.equal(
			cartEndpoints.cart(US),
			'https://api.nike.com/buy/carts/v2/US/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY',
		)
	})

	it('cartEndpoints.cartGet(FR) resolves to the bare FR cart path', () => {
		assert.equal(
			cartEndpoints.cartGet(FR),
			'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM',
		)
	})

	it('cartEndpoints.fulfillmentOfferings(US) ends with ?marketplace=US&language=en', () => {
		const url = cartEndpoints.fulfillmentOfferings(US)
		assert.ok(url.endsWith('?marketplace=US&language=en'), `Got: ${url}`)
	})

	it('cartEndpoints.productUrl(FR) builds the correct locale prefix', () => {
		assert.equal(
			cartEndpoints.productUrl(FR, 'air-max-jBrhdR', 'CW2288-111'),
			'/fr/t/air-max-jBrhdR/CW2288-111',
		)
	})

	it('cartEndpoints.productUrl(US) uses en locale prefix', () => {
		assert.equal(
			cartEndpoints.productUrl(US, 'air-max-jBrhdR', 'CW2288-111'),
			'/en/t/air-max-jBrhdR/CW2288-111',
		)
	})
})

describe('NikeCartApi constructor — fail-fast on unknown country (Story 13.2)', () => {
	it('throws UnknownCountryError immediately for an unknown country code', () => {
		const { page } = mockPage({ json: sampleCart })
		assert.throws(
			() => new NikeCartApi(page, 'XX'),
			(err: unknown) => {
				assert.ok(err instanceof UnknownCountryError)
				assert.match(err.message, /XX/)
				return true
			},
		)
	})

	it('succeeds construction for known country FR', () => {
		const { page } = mockPage({ json: sampleCart })
		assert.doesNotThrow(() => new NikeCartApi(page, 'FR'))
	})

	it('succeeds construction for known country US (even if enabled: false)', () => {
		const { page } = mockPage({ json: sampleCart })
		assert.doesNotThrow(() => new NikeCartApi(page, 'US'))
	})
})

describe('NikeCartApi.initVisitor — country-aware URL (Story 13.2)', () => {
	it('initVisitor(uuid) on FR issues fetch to the exact FR cart URL', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page, 'FR')
		await api.initVisitor('test-uuid')
		assert.equal(
			calls[0]!.url,
			'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY',
		)
	})

	it('initVisitor(uuid) on US issues fetch to the exact US cart URL', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page, 'US')
		await api.initVisitor('test-uuid')
		assert.equal(
			calls[0]!.url,
			'https://api.nike.com/buy/carts/v2/US/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY',
		)
	})

	it('addItem on FR uses /fr/t/ locale prefix (13.4 TODO resolved)', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page, 'FR')
		await api.addItem('SKU-1', 'air-max', 'CW2288-111')
		const body = JSON.parse(calls[0]!.data ?? '[]') as Array<{ value: { itemData: { url: string } } }>
		assert.equal(body[0]!.value.itemData.url, '/fr/t/air-max/CW2288-111')
	})

	it('addItem on US uses /en/t/ locale prefix', async () => {
		const { page, calls } = mockPage({ json: sampleCart })
		const api = new NikeCartApi(page, 'US')
		await api.addItem('SKU-1', 'air-max', 'CW2288-111')
		const body = JSON.parse(calls[0]!.data ?? '[]') as Array<{ value: { itemData: { url: string } } }>
		assert.equal(body[0]!.value.itemData.url, '/en/t/air-max/CW2288-111')
	})
})
