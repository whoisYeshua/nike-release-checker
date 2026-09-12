// NikeReviewApi — calls api.nike.com/buy/cart_reviews/v2/* via page.evaluate(() => fetch())
// so requests run inside the browser JS context where Kasada's injected ServiceWorker
// can attach valid x-kpsdk-cd proof-of-work headers.
// Bearer token is extracted from OIDC localStorage by getBearerToken().
//
// Review UUIDs are client-generated (crypto.randomUUID). The review is the last
// checkpoint before PUT /buy/checkouts/<cartId> (Story 12.8).
// Story 12.6, FR66.

import type { Page } from 'playwright'
import { randomUUID } from 'node:crypto'
import type { CartReview, ComputedTotal } from './reviewApi.types.ts'
import { getBearerToken } from './oidcBearer.ts'

const API_ORIGIN = 'https://api.nike.com'
const CART_REVIEWS_BASE = '/buy/cart_reviews/v2'

// Injectable UUID generator so tests can stub it deterministically.
export type UuidGen = () => string
export const defaultUuidGen: UuidGen = () => randomUUID()

// ─── Error classes ────────────────────────────────────────────────────────────

// BlockReason: total_mismatch (terminal — must NOT be caught inside this story)
export class TotalMismatchError extends Error {
	readonly name = 'TotalMismatchError'
	readonly expected: number
	readonly computed: ComputedTotal
	readonly delta: number

	constructor(expected: number, computed: ComputedTotal, delta: number) {
		super(
			`total mismatch: expected ${expected} ${computed.currency}, computed ${computed.total} (delta ${delta})`,
		)
		this.expected = expected
		this.computed = computed
		this.delta = delta
	}
}

// BlockReason: review_timeout
export class ReviewTimeoutError extends Error {
	readonly name = 'ReviewTimeoutError'
	readonly reviewId: string
	readonly lastStatus: string | undefined
	readonly elapsedMs: number

	constructor(reviewId: string, lastStatus: string | undefined, elapsedMs: number) {
		super(`review ${reviewId} timed out after ${elapsedMs}ms (last=${lastStatus})`)
		this.reviewId = reviewId
		this.lastStatus = lastStatus
		this.elapsedMs = elapsedMs
	}
}

// BlockReason: review_failed
export class ReviewError extends Error {
	readonly name = 'ReviewError'
	readonly review: CartReview

	constructor(review: CartReview) {
		super(`review ${review.reviewId} entered ERROR`)
		this.review = review
	}
}

export class ReviewApiError extends Error {
	readonly name = 'ReviewApiError'
	readonly status: number
	readonly bodyPreview: string

	constructor(status: number, body: string) {
		super(`Nike cart_reviews API → ${status}`)
		this.status = status
		this.bodyPreview = body.slice(0, 256)
	}
}

// ─── Total-mismatch validator (AC: ±0.01 tolerance) ──────────────────────────

const PRICE_TOLERANCE = 0.01

export const assertTotalMatches = (expected: number, computed: ComputedTotal): void => {
	const delta = Math.abs(computed.total - expected)
	if (delta > PRICE_TOLERANCE) {
		throw new TotalMismatchError(expected, computed, delta)
	}
}

// ─── Transport helpers ────────────────────────────────────────────────────────

interface ReviewRequestInit {
	method: 'GET' | 'PUT'
	data?: string
}

// ─── API client ───────────────────────────────────────────────────────────────

export class NikeReviewApi {
	private readonly page: Page
	private readonly uuidGen: UuidGen

	constructor(page: Page, uuidGen: UuidGen = defaultUuidGen) {
		this.page = page
		this.uuidGen = uuidGen
	}

	// Opens a review for the given cartId. Generates a fresh client-side reviewUuid per call.
	// PUT https://api.nike.com/buy/cart_reviews/v2/<reviewUuid>  body: {cartId}
	async openReview(args: { cartId: string }): Promise<CartReview> {
		const reviewUuid = this.uuidGen()
		const res = await this.request<Omit<CartReview, 'reviewId'>>(
			`${CART_REVIEWS_BASE}/${reviewUuid}`,
			{ method: 'PUT', data: JSON.stringify({ cartId: args.cartId }) },
		)
		return { reviewId: reviewUuid, ...res }
	}

	// GET https://api.nike.com/buy/cart_reviews/v2/<reviewId>
	async fetchReview(reviewId: string): Promise<CartReview> {
		return this.request<CartReview>(`${CART_REVIEWS_BASE}/${reviewId}`, { method: 'GET' })
	}

	// Polls fetchReview until status === 'READY' or timeout.
	async waitForReview(
		reviewId: string,
		opts: { timeoutMs?: number; intervalMs?: number } = {},
	): Promise<CartReview> {
		const timeoutMs = opts.timeoutMs ?? 8_000
		const intervalMs = opts.intervalMs ?? 250
		const start = Date.now()
		let last: CartReview | undefined

		while (Date.now() - start < timeoutMs) {
			last = await this.fetchReview(reviewId)
			if (last.status === 'READY') return last
			if (last.status === 'ERROR') throw new ReviewError(last)
			await new Promise<void>((r) => setTimeout(r, intervalMs))
		}

		throw new ReviewTimeoutError(reviewId, last?.status, Date.now() - start)
	}

	// ─── Private transport ────────────────────────────────────────────────────

	private async request<T>(path: string, init: ReviewRequestInit): Promise<T> {
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
			throw new ReviewApiError(res.status, res.body)
		}

		try {
			return JSON.parse(res.body) as T
		} catch {
			throw new ReviewApiError(res.status, res.body)
		}
	}
}
