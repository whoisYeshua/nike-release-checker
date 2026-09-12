// protectedFetch — Retry-once wrapper for KPSDK-protected Nike API calls.
//
// On HTTP 403 or 429 (Kasada blocks):
//   1. Invalidates the cache entry for (accountId, country)
//   2. Reloads the page silently to re-bootstrap p.js and get a fresh token
//   3. Retries the original request exactly once
//   4. If the retry also returns 403/429 → throws KpsdkBlockedError
//
// Non-403/429 errors propagate directly — they are NOT Kasada blocks.
//
// See Story 14.3 (FR68, NFR35).

import type { Page, APIResponse } from 'playwright'
import { type KpsdkCache, refreshKpsdkToken } from './cache.js'
import { getKpsdkExtractor } from './extractor.js'

// ---------------------------------------------------------------------------
// Error type — enriched (accountId/country/url/attempts/lastStatus)
// Distinct from the step-level KpsdkBlockedError in checkout/api/apiErrors.ts.
// ---------------------------------------------------------------------------

export class KpsdkBlockedError extends Error {
	readonly accountId: string
	readonly country: string
	readonly url: string
	readonly attempts: number
	readonly lastStatus: number

	constructor(
		accountId: string,
		country: string,
		url: string,
		attempts: number,
		lastStatus: number,
	) {
		super(`KPSDK blocked after ${attempts} attempts: ${lastStatus} ${url}`)
		this.name = 'KpsdkBlockedError'
		this.accountId = accountId
		this.country = country
		this.url = url
		this.attempts = attempts
		this.lastStatus = lastStatus
	}
}

// ---------------------------------------------------------------------------
// Type alias for Playwright fetch options
// ---------------------------------------------------------------------------

export type ProtectedFetchInit = Parameters<Page['request']['fetch']>[1]

// ---------------------------------------------------------------------------
// Block status set — 403 (KPSDK challenge) and 429 (rate-limit / Kasada)
// ---------------------------------------------------------------------------

const BLOCK_STATUSES = new Set([403, 429])

// ---------------------------------------------------------------------------
// protectedFetch — public wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a single `page.request.fetch()` call with KPSDK-aware retry logic.
 *
 * @param page       - Playwright Page whose request context carries the KPSDK token.
 * @param cache      - KpsdkCache instance (typically the module-level singleton).
 * @param accountId  - Account identifier, used as the cache key dimension.
 * @param country    - ISO-2 country code, used as the cache key dimension.
 * @param url        - Full URL to fetch (must be a protected endpoint).
 * @param init       - Playwright fetch options (method, headers, data…).
 * @returns          - The successful APIResponse (2xx).
 * @throws KpsdkBlockedError if both attempts return 403/429.
 */
export async function protectedFetch(
	page: Page,
	cache: KpsdkCache,
	accountId: string,
	country: string,
	url: string,
	init: ProtectedFetchInit,
): Promise<APIResponse> {
	const first = await page.request.fetch(url, init)

	if (!BLOCK_STATUSES.has(first.status())) return first

	// ---- Kasada block detected — refresh + retry exactly once ----

	const reloadStart = Date.now()

	// 1. Invalidate stale cache entry
	cache.invalidate(accountId, country)

	// 2. Silent page reload to re-bootstrap p.js
	await page.reload({ waitUntil: 'domcontentloaded' })

	const reloadMs = Date.now() - reloadStart
	// Structured log — kept minimal to avoid playwright import coupling in tests
	// Callers that want richer telemetry should wrap protectedFetch.
	console.info(
		JSON.stringify({ event: 'kpsdk_refresh', accountId, country, reloadMs }),
	)

	// 3. Confirm a new token has been captured (extractor re-emits on reload)
	const extractor = getKpsdkExtractor(page, country)
	const freshToken = await extractor.getToken()

	if (!freshToken) {
		// Token capture failed — cannot retry safely, escalate immediately.
		throw new KpsdkBlockedError(accountId, country, url, 1, first.status())
	}

	// 4. Retry the original request once with the same init payload
	const second = await page.request.fetch(url, init)

	if (!BLOCK_STATUSES.has(second.status())) return second

	throw new KpsdkBlockedError(accountId, country, url, 2, second.status())
}

// ---------------------------------------------------------------------------
// KpsdkClient implementation — satisfies the interface from kpsdkClient.types.ts
// Replaces the stubKpsdkClient shipped with Story 12.9.
// ---------------------------------------------------------------------------

import type { KpsdkClient } from '../../checkout/api/kpsdkClient.types.js'

/**
 * Real KpsdkClient backed by the cache + extractor infrastructure from
 * Stories 14.1 and 14.2.
 *
 * Wire this into RetryContext.kpsdkClient at app boot instead of stubKpsdkClient.
 */
export class RealKpsdkClient implements KpsdkClient {
	private readonly cache: KpsdkCache
	private readonly accountId: string
	private readonly country: string

	constructor(cache: KpsdkCache, accountId: string, country: string) {
		this.cache = cache
		this.accountId = accountId
		this.country = country
	}

	async refresh(page: Page): Promise<void> {
		this.cache.invalidate(this.accountId, this.country)
		await page.reload({ waitUntil: 'domcontentloaded' })
		await refreshKpsdkToken(this.cache, this.accountId, this.country, page)
	}

	currentToken(): { ct: string; v: string } | null {
		const token = this.cache.get(this.accountId, this.country)
		if (!token) return null
		return { ct: token.ct, v: token.v }
	}
}
