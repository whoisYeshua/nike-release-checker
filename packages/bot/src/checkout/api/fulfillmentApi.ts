// NikeFulfillmentApi — calls api.nike.com/buy/fulfillment_offerings/* via page.evaluate(() => fetch())
// so requests run inside the browser JS context where Kasada's injected ServiceWorker
// can attach valid x-kpsdk-cd proof-of-work headers.
// Bearer token is extracted from OIDC localStorage by getBearerToken().
//
// Nike's filter syntax: filter=key(value), multiple filter= params allowed.
// Parens must NOT be URL-encoded — use buildFilterQuery() helper.
// Story 12.4, FR63.

import type { Page } from 'playwright'
import { randomUUID } from 'node:crypto'
import type { FulfillmentOffering, FulfillmentType, PricingJob } from './fulfillmentApi.types.ts'
import { getBearerToken } from './oidcBearer.ts'

const API_ORIGIN = 'https://api.nike.com'

// ─── Task 3: Filter encoding helper ──────────────────────────────────────────
// Nike's filter syntax requires literal parens, NOT URL-encoded.
// URLSearchParams encodes parens as %28/%29 — avoid it for filter values.
export const buildFilterQuery = (filters: ReadonlyArray<[string, string]>): string =>
	filters.map(([k, v]) => `filter=${k}(${v})`).join('&')

// ─── Task 5: Error classes ────────────────────────────────────────────────────

// BlockReason mapping:
//   FulfillmentJobFailedError   → fulfillment_unavailable
//   FulfillmentJobTimeoutError  → fulfillment_timeout
//   NoFulfillmentOfferingError  → no_shipping_method

export class FulfillmentJobFailedError extends Error {
	readonly name = 'FulfillmentJobFailedError'
	readonly job: PricingJob
	constructor(job: PricingJob) {
		super(`pricing job ${job.jobId} failed: ${job.failureReason}`)
		this.job = job
	}
}

export class FulfillmentJobTimeoutError extends Error {
	readonly name = 'FulfillmentJobTimeoutError'
	readonly jobId: string
	readonly lastStatus: string | undefined
	readonly elapsedMs: number
	constructor(
		jobId: string,
		lastStatus: string | undefined,
		elapsedMs: number,
	) {
		super(`pricing job ${jobId} timed out after ${elapsedMs}ms (last=${lastStatus})`)
		this.jobId = jobId
		this.lastStatus = lastStatus
		this.elapsedMs = elapsedMs
	}
}

export class NoFulfillmentOfferingError extends Error {
	readonly name = 'NoFulfillmentOfferingError'
	readonly country: string
	readonly skuId: string
	constructor(country: string, skuId: string) {
		super(`no fulfillment offering for sku ${skuId} in ${country}`)
		this.country = country
		this.skuId = skuId
	}
}

export class FulfillmentApiError extends Error {
	readonly name = 'FulfillmentApiError'
	readonly status: number
	readonly bodyPreview: string

	constructor(status: number, body: string) {
		super(`Nike fulfillment API → ${status}`)
		this.status = status
		this.bodyPreview = body.slice(0, 256)
	}
}

// ─── Task 4: Default offering picker ─────────────────────────────────────────

export function pickDefaultOffering(
	offerings: FulfillmentOffering[],
	country = '',
	skuId = '',
): FulfillmentOffering {
	if (offerings.length === 0) {
		throw new NoFulfillmentOfferingError(country, skuId)
	}

	// 1. Prefer SHIP over PICKUP
	const shipOfferings = offerings.filter((o) => o.type === 'SHIP')
	const pool = shipOfferings.length > 0 ? shipOfferings : offerings

	// 2. Among pool with cost info, pick cheapest
	const withCost = pool.filter((o) => o.cost !== undefined)
	if (withCost.length > 0) {
		return withCost.reduce((best, cur) =>
			(cur.cost!.amount < best.cost!.amount ? cur : best),
		)
	}

	// 3. No cost info — pick first alphabetically by carrier
	return [...pool].sort((a, b) => a.carrier.localeCompare(b.carrier))[0]!
}

// ─── Transport helpers ────────────────────────────────────────────────────────

interface FulfillmentRequestInit {
	method: 'GET' | 'PUT'
	data?: string
}

// ─── Task 2: NikeFulfillmentApi ───────────────────────────────────────────────

export class NikeFulfillmentApi {
	private readonly page: Page
	constructor(page: Page) {
		this.page = page
	}

	// Lists available fulfillment offerings for a given country, currency, and SKU.
	// GET /buy/fulfillment_offerings/v1?filter=countryCode(FR)&filter=currency(EUR)&filter=skuId(<sku>)
	async listOfferings(args: {
		country: string
		currency: string
		skuId: string
	}): Promise<FulfillmentOffering[]> {
		const qs = buildFilterQuery([
			['countryCode', args.country],
			['currency', args.currency],
			['skuId', args.skuId],
		])
		const res = await this.request<{ objects?: FulfillmentOffering[] }>(
			`/buy/fulfillment_offerings/v1?${qs}`,
			{ method: 'GET' },
		)
		return res.objects ?? []
	}

	// Lists available fulfillment types for a given country.
	// GET /buy/fulfillment_types/v1?filter=countryCode(FR)
	async listFulfillmentTypes(country: string): Promise<FulfillmentType[]> {
		const res = await this.request<{ types?: FulfillmentType[] }>(
			`/buy/fulfillment_types/v1?filter=countryCode(${country})`,
			{ method: 'GET' },
		)
		return res.types ?? []
	}

	// Starts an async pricing job for a given cart + offering.
	// PUT /buy/fulfillment_offerings_jobs/v2/<jobUuid>
	// jobUuid is client-generated (same pattern as cart view UUIDs in 12.3).
	async startPricingJob(args: {
		cartId: string
		offeringId: string
	}): Promise<PricingJob> {
		const jobUuid = randomUUID()
		const res = await this.request<Omit<PricingJob, 'jobId'>>(
			`/buy/fulfillment_offerings_jobs/v2/${jobUuid}`,
			{ method: 'PUT', data: JSON.stringify(args) },
		)
		return { jobId: jobUuid, ...res }
	}

	// Polls the pricing job until COMPLETED or FAILED, or timeout.
	async waitForJob(
		jobId: string,
		opts: { timeoutMs?: number; intervalMs?: number } = {},
	): Promise<PricingJob> {
		const timeoutMs = opts.timeoutMs ?? 8_000
		const intervalMs = opts.intervalMs ?? 200
		const start = Date.now()
		let last: PricingJob | undefined

		while (Date.now() - start < timeoutMs) {
			last = await this.request<PricingJob>(
				`/buy/fulfillment_offerings_jobs/v2/${jobId}`,
				{ method: 'GET' },
			)
			if (last.status === 'COMPLETED') return last
			if (last.status === 'FAILED') throw new FulfillmentJobFailedError(last)
			await new Promise<void>((r) => setTimeout(r, intervalMs))
		}

		throw new FulfillmentJobTimeoutError(jobId, last?.status, Date.now() - start)
	}

	// ─── Private transport ────────────────────────────────────────────────────

	private async request<T>(path: string, init: FulfillmentRequestInit): Promise<T> {
		const token = await getBearerToken(this.page)

		const args = {
			url: `${API_ORIGIN}${path}`,
			method: init.method,
			headers: {
				accept: 'application/json',
				...(init.data !== undefined
					? { 'content-type': 'application/json; charset=UTF-8' }
					: {}),
			},
			data: init.data ?? null,
			token,
		}

		// Runs inside the browser JS context so Kasada's ServiceWorker intercept fires
		// and attaches x-kpsdk-cd / x-kpsdk-cr POW headers.
		const res = await this.page.evaluate(
			async (a: {
				url: string
				method: string
				headers: Record<string, string>
				data: string | null
				token: string
			}) => {
				const r = await fetch(a.url, {
					method: a.method,
					credentials: 'include',
					body: a.data ?? null,
					headers: {
						...a.headers,
						Authorization: 'Bearer ' + a.token,
					},
				})
				const headersObj: Record<string, string> = {}
				r.headers.forEach((v, k) => {
					headersObj[k] = v
				})
				let bodyText = ''
				try {
					bodyText = await r.text()
				} catch {
					bodyText = ''
				}
				return {
					status: r.status,
					headers: headersObj,
					body: bodyText,
					ok: r.ok,
				}
			},
			args,
		)

		if (!res.ok) {
			throw new FulfillmentApiError(res.status, res.body)
		}

		try {
			return JSON.parse(res.body) as T
		} catch {
			throw new FulfillmentApiError(res.status, res.body)
		}
	}
}
