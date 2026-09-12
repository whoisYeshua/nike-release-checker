import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import {
	NikeFulfillmentApi,
	FulfillmentJobFailedError,
	FulfillmentJobTimeoutError,
	NoFulfillmentOfferingError,
	FulfillmentApiError,
	buildFilterQuery,
	pickDefaultOffering,
} from './fulfillmentApi.ts'
import type { FulfillmentOffering, PricingJob } from './fulfillmentApi.types.ts'

// ─── Mock factory (mirrors cartViewsApi.test.ts pattern) ─────────────────────

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
			// Case B: fulfillment fetch
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

const SAMPLE_OFFERING: FulfillmentOffering = {
	offeringId: 'offering-uuid-1',
	carrier: 'COLISSIMO',
	serviceLevel: 'STANDARD',
	estimatedDays: { min: 2, max: 5 },
	type: 'SHIP',
	cost: { amount: 5.99, currency: 'EUR' },
}

const SAMPLE_JOB_PENDING: PricingJob = {
	jobId: 'job-uuid-1',
	status: 'PENDING',
}

const SAMPLE_JOB_COMPLETED: PricingJob = {
	jobId: 'job-uuid-1',
	status: 'COMPLETED',
	pricedOffering: {
		offeringId: 'offering-uuid-1',
		totalCost: { amount: 185.99, currency: 'EUR' },
		taxBreakdown: [{ label: 'TVA', amount: 30.99 }],
		etaWindow: { earliest: '2025-05-01', latest: '2025-05-03' },
	},
}

const SAMPLE_JOB_FAILED: PricingJob = {
	jobId: 'job-uuid-1',
	status: 'FAILED',
	failureReason: 'CARRIER_UNAVAILABLE',
}

// ─── Task 3: buildFilterQuery ─────────────────────────────────────────────────

describe('buildFilterQuery', () => {
	it('produces literal parens — NOT URL-encoded', () => {
		const qs = buildFilterQuery([['countryCode', 'FR']])
		assert.equal(qs, 'filter=countryCode(FR)')
		// Parens must not be encoded
		assert.ok(!qs.includes('%28'), 'open paren must not be percent-encoded')
		assert.ok(!qs.includes('%29'), 'close paren must not be percent-encoded')
	})

	it('joins multiple filters with &', () => {
		const qs = buildFilterQuery([
			['countryCode', 'FR'],
			['currency', 'EUR'],
			['skuId', 'abc123'],
		])
		assert.equal(qs, 'filter=countryCode(FR)&filter=currency(EUR)&filter=skuId(abc123)')
	})

	it('returns empty string for empty array', () => {
		assert.equal(buildFilterQuery([]), '')
	})
})

// ─── listOfferings ────────────────────────────────────────────────────────────

describe('NikeFulfillmentApi.listOfferings', () => {
	it('builds correct multi-filter URL with literal parens', async () => {
		const { page, calls } = mockPage({ json: { objects: [SAMPLE_OFFERING] } })
		const api = new NikeFulfillmentApi(page)

		await api.listOfferings({ country: 'FR', currency: 'EUR', skuId: 'abc123' })

		assert.equal(calls.length, 1)
		assert.equal(
			calls[0]!.url,
			'https://api.nike.com/buy/fulfillment_offerings/v1?filter=countryCode(FR)&filter=currency(EUR)&filter=skuId(abc123)',
		)
		assert.equal(calls[0]!.method, 'GET')
	})

	it('URL does not contain percent-encoded parens', async () => {
		const { page, calls } = mockPage({ json: { objects: [] } })
		const api = new NikeFulfillmentApi(page)

		await api.listOfferings({ country: 'FR', currency: 'EUR', skuId: 'sku-x' })

		assert.ok(!calls[0]!.url.includes('%28'))
		assert.ok(!calls[0]!.url.includes('%29'))
	})

	it('sets accept: application/json header', async () => {
		const { page, calls } = mockPage({ json: { objects: [] } })
		const api = new NikeFulfillmentApi(page)

		await api.listOfferings({ country: 'FR', currency: 'EUR', skuId: 'sku-x' })

		assert.equal(calls[0]!.headers?.['accept'], 'application/json')
	})

	it('returns parsed array of FulfillmentOffering', async () => {
		const { page } = mockPage({ json: { objects: [SAMPLE_OFFERING] } })
		const api = new NikeFulfillmentApi(page)

		const result = await api.listOfferings({ country: 'FR', currency: 'EUR', skuId: 'abc123' })

		assert.deepEqual(result, [SAMPLE_OFFERING])
	})

	it('returns empty array when objects is missing', async () => {
		const { page } = mockPage({ json: {} })
		const api = new NikeFulfillmentApi(page)

		const result = await api.listOfferings({ country: 'FR', currency: 'EUR', skuId: 'sku-x' })

		assert.deepEqual(result, [])
	})

	it('throws FulfillmentApiError on non-ok response', async () => {
		const { page } = mockPage({ ok: false, status: 401, text: 'unauthorized' })
		const api = new NikeFulfillmentApi(page)

		await assert.rejects(
			() => api.listOfferings({ country: 'FR', currency: 'EUR', skuId: 'sku-x' }),
			(err: unknown) => {
				assert.ok(err instanceof FulfillmentApiError)
				assert.equal(err.status, 401)
				return true
			},
		)
	})
})

// ─── listFulfillmentTypes ─────────────────────────────────────────────────────

describe('NikeFulfillmentApi.listFulfillmentTypes', () => {
	it('issues GET /buy/fulfillment_types/v1?filter=countryCode(FR)', async () => {
		const { page, calls } = mockPage({ json: { types: ['SHIP', 'PICKUP'] } })
		const api = new NikeFulfillmentApi(page)

		await api.listFulfillmentTypes('FR')

		assert.equal(calls[0]!.url, 'https://api.nike.com/buy/fulfillment_types/v1?filter=countryCode(FR)')
		assert.equal(calls[0]!.method, 'GET')
	})

	it('returns types array preserving order', async () => {
		const { page } = mockPage({ json: { types: ['SHIP', 'PICKUP'] } })
		const api = new NikeFulfillmentApi(page)

		const result = await api.listFulfillmentTypes('FR')

		assert.deepEqual(result, ['SHIP', 'PICKUP'])
	})

	it('returns empty array when types is missing', async () => {
		const { page } = mockPage({ json: {} })
		const api = new NikeFulfillmentApi(page)

		const result = await api.listFulfillmentTypes('FR')

		assert.deepEqual(result, [])
	})
})

// ─── startPricingJob ──────────────────────────────────────────────────────────

describe('NikeFulfillmentApi.startPricingJob', () => {
	it('issues PUT to /buy/fulfillment_offerings_jobs/v2/<uuid>', async () => {
		const { page, calls } = mockPage({ json: { status: 'PENDING' } })
		const api = new NikeFulfillmentApi(page)

		const result = await api.startPricingJob({ cartId: 'cart-1', offeringId: 'off-1' })

		assert.equal(calls.length, 1)
		assert.ok(
			calls[0]!.url.startsWith('https://api.nike.com/buy/fulfillment_offerings_jobs/v2/'),
		)
		assert.equal(calls[0]!.method, 'PUT')
		// Returns a jobId that matches the UUID in the URL
		const urlUuid = calls[0]!.url.split('/').at(-1)!
		assert.equal(result.jobId, urlUuid)
	})

	it('jobId is a valid UUID v4 format', async () => {
		const { page } = mockPage({ json: { status: 'PENDING' } })
		const api = new NikeFulfillmentApi(page)

		const result = await api.startPricingJob({ cartId: 'cart-1', offeringId: 'off-1' })

		assert.match(result.jobId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
	})

	it('sends cartId and offeringId in body', async () => {
		const { page, calls } = mockPage({ json: { status: 'PENDING' } })
		const api = new NikeFulfillmentApi(page)

		await api.startPricingJob({ cartId: 'cart-123', offeringId: 'offering-456' })

		const body = JSON.parse(calls[0]!.data as string)
		assert.equal(body.cartId, 'cart-123')
		assert.equal(body.offeringId, 'offering-456')
	})

	it('sets content-type: application/json; charset=UTF-8 for PUT', async () => {
		const { page, calls } = mockPage({ json: { status: 'PENDING' } })
		const api = new NikeFulfillmentApi(page)

		await api.startPricingJob({ cartId: 'cart-1', offeringId: 'off-1' })

		assert.equal(calls[0]!.headers?.['content-type'], 'application/json; charset=UTF-8')
	})

	it('returns PricingJob with jobId and status merged', async () => {
		const { page } = mockPage({ json: { status: 'PENDING' } })
		const api = new NikeFulfillmentApi(page)

		const result = await api.startPricingJob({ cartId: 'cart-1', offeringId: 'off-1' })

		assert.ok(typeof result.jobId === 'string' && result.jobId.length > 0)
		assert.equal(result.status, 'PENDING')
	})
})

// ─── waitForJob ───────────────────────────────────────────────────────────────

describe('NikeFulfillmentApi.waitForJob', () => {
	it('polls GET /buy/fulfillment_offerings_jobs/v2/<jobId> and resolves on COMPLETED', async () => {
		const sequence = [
			{ ok: true, status: 200, json: SAMPLE_JOB_PENDING },
			{ ok: true, status: 200, json: SAMPLE_JOB_PENDING },
			{ ok: true, status: 200, json: SAMPLE_JOB_COMPLETED },
		]
		const { page, calls } = mockPageSequence('mock-bearer', sequence)
		const api = new NikeFulfillmentApi(page)

		const result = await api.waitForJob('job-uuid-1', { intervalMs: 0 })

		assert.deepEqual(result, SAMPLE_JOB_COMPLETED)
		assert.equal(calls.length, 3)
		for (const c of calls) {
			assert.equal(c.url, 'https://api.nike.com/buy/fulfillment_offerings_jobs/v2/job-uuid-1')
			assert.equal(c.method, 'GET')
		}
	})

	it('resolves immediately when first poll is COMPLETED', async () => {
		const { page, calls } = mockPage({ json: SAMPLE_JOB_COMPLETED })
		const api = new NikeFulfillmentApi(page)

		const result = await api.waitForJob('job-uuid-1', { intervalMs: 0 })

		assert.deepEqual(result, SAMPLE_JOB_COMPLETED)
		assert.equal(calls.length, 1)
	})

	it('rejects with FulfillmentJobFailedError on FAILED', async () => {
		const sequence = [
			{ ok: true, status: 200, json: SAMPLE_JOB_PENDING },
			{ ok: true, status: 200, json: SAMPLE_JOB_FAILED },
		]
		const { page, calls } = mockPageSequence('mock-bearer', sequence)
		const api = new NikeFulfillmentApi(page)

		await assert.rejects(
			() => api.waitForJob('job-uuid-1', { intervalMs: 0 }),
			(err: unknown) => {
				assert.ok(err instanceof FulfillmentJobFailedError)
				assert.deepEqual(err.job, SAMPLE_JOB_FAILED)
				assert.ok(err.message.includes('CARRIER_UNAVAILABLE'))
				return true
			},
		)

		assert.equal(calls.length, 2)
	})

	it('rejects with FulfillmentJobTimeoutError when all polls return PENDING', async () => {
		const { page } = mockPage({ json: SAMPLE_JOB_PENDING })
		const api = new NikeFulfillmentApi(page)

		await assert.rejects(
			() => api.waitForJob('job-uuid-1', { timeoutMs: 10, intervalMs: 0 }),
			(err: unknown) => {
				assert.ok(err instanceof FulfillmentJobTimeoutError)
				assert.equal(err.jobId, 'job-uuid-1')
				assert.equal(err.lastStatus, 'PENDING')
				assert.ok(err.elapsedMs >= 0)
				return true
			},
		)
	})

	it('FulfillmentJobTimeoutError carries all required fields (jobId, lastStatus, elapsedMs)', async () => {
		const { page } = mockPage({ json: SAMPLE_JOB_PENDING })
		const api = new NikeFulfillmentApi(page)

		try {
			await api.waitForJob('some-job-id', { timeoutMs: 1, intervalMs: 0 })
			assert.fail('expected throw')
		} catch (err) {
			assert.ok(err instanceof FulfillmentJobTimeoutError)
			assert.equal(err.jobId, 'some-job-id')
			assert.equal(err.lastStatus, 'PENDING')
			assert.ok(typeof err.elapsedMs === 'number')
		}
	})
})

// ─── Task 4: pickDefaultOffering ─────────────────────────────────────────────

describe('pickDefaultOffering', () => {
	it('throws NoFulfillmentOfferingError on empty list', () => {
		assert.throws(
			() => pickDefaultOffering([], 'FR', 'sku-1'),
			(err: unknown) => {
				assert.ok(err instanceof NoFulfillmentOfferingError)
				assert.equal(err.country, 'FR')
				assert.equal(err.skuId, 'sku-1')
				return true
			},
		)
	})

	it('prefers SHIP over PICKUP', () => {
		const pickup: FulfillmentOffering = {
			offeringId: 'pickup-1',
			carrier: 'CLICK_AND_COLLECT',
			serviceLevel: 'STANDARD',
			type: 'PICKUP',
		}
		const ship: FulfillmentOffering = {
			offeringId: 'ship-1',
			carrier: 'COLISSIMO',
			serviceLevel: 'STANDARD',
			type: 'SHIP',
		}
		const result = pickDefaultOffering([pickup, ship])
		assert.equal(result.type, 'SHIP')
		assert.equal(result.offeringId, 'ship-1')
	})

	it('picks cheapest SHIP by cost.amount', () => {
		const expensive: FulfillmentOffering = {
			offeringId: 'ship-exp',
			carrier: 'DHL',
			serviceLevel: 'EXPRESS',
			type: 'SHIP',
			cost: { amount: 15.99, currency: 'EUR' },
		}
		const cheap: FulfillmentOffering = {
			offeringId: 'ship-cheap',
			carrier: 'COLISSIMO',
			serviceLevel: 'STANDARD',
			type: 'SHIP',
			cost: { amount: 4.99, currency: 'EUR' },
		}
		const result = pickDefaultOffering([expensive, cheap])
		assert.equal(result.offeringId, 'ship-cheap')
	})

	it('falls back to alphabetical carrier when no cost info', () => {
		const zeta: FulfillmentOffering = {
			offeringId: 'ship-z',
			carrier: 'ZETA_CARRIER',
			serviceLevel: 'STANDARD',
			type: 'SHIP',
		}
		const alpha: FulfillmentOffering = {
			offeringId: 'ship-a',
			carrier: 'ALPHA_CARRIER',
			serviceLevel: 'STANDARD',
			type: 'SHIP',
		}
		const result = pickDefaultOffering([zeta, alpha])
		assert.equal(result.carrier, 'ALPHA_CARRIER')
	})

	it('returns PICKUP when only PICKUP offerings available', () => {
		const pickup: FulfillmentOffering = {
			offeringId: 'pickup-1',
			carrier: 'CLICK_AND_COLLECT',
			serviceLevel: 'STANDARD',
			type: 'PICKUP',
		}
		const result = pickDefaultOffering([pickup])
		assert.equal(result.type, 'PICKUP')
	})

	it('picks cheapest among mixed cost/no-cost: those with cost win over no-cost', () => {
		const withCost: FulfillmentOffering = {
			offeringId: 'ship-1',
			carrier: 'ZZZCOST',
			serviceLevel: 'STANDARD',
			type: 'SHIP',
			cost: { amount: 9.99, currency: 'EUR' },
		}
		const noCost: FulfillmentOffering = {
			offeringId: 'ship-2',
			carrier: 'AAANONE',
			serviceLevel: 'STANDARD',
			type: 'SHIP',
			// no cost field
		}
		// withCost should win since cost info is available
		const result = pickDefaultOffering([noCost, withCost])
		assert.equal(result.offeringId, 'ship-1')
	})
})

// ─── Error class messages ─────────────────────────────────────────────────────

describe('Error classes', () => {
	it('FulfillmentJobFailedError message includes jobId and failureReason', () => {
		const err = new FulfillmentJobFailedError(SAMPLE_JOB_FAILED)
		assert.ok(err.message.includes('job-uuid-1'))
		assert.ok(err.message.includes('CARRIER_UNAVAILABLE'))
		assert.equal(err.name, 'FulfillmentJobFailedError')
	})

	it('FulfillmentJobTimeoutError message includes jobId, elapsedMs, lastStatus', () => {
		const err = new FulfillmentJobTimeoutError('job-abc', 'PENDING', 8001)
		assert.ok(err.message.includes('job-abc'))
		assert.ok(err.message.includes('8001'))
		assert.ok(err.message.includes('PENDING'))
		assert.equal(err.name, 'FulfillmentJobTimeoutError')
	})

	it('NoFulfillmentOfferingError message includes skuId and country', () => {
		const err = new NoFulfillmentOfferingError('FR', 'sku-xyz')
		assert.ok(err.message.includes('sku-xyz'))
		assert.ok(err.message.includes('FR'))
		assert.equal(err.name, 'NoFulfillmentOfferingError')
	})
})
