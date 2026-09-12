// withApiRetry — single-envelope retry policy for all Nike API calls.
// One retry maximum per error class per call. NFR1 30 s budget depends on
// this discipline being respected end-to-end.
//
// See Story 12.9 — API error handling.

import type { Page } from 'playwright'
import {
	KpsdkBlockedError,
	RateLimitedError,
	ServerError,
	SessionExpiredError,
} from './apiErrors.ts'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RetryContext {
	page: Page
	/** True iff the operation is safe to replay on 5xx (GET, PUT with client-generated UUID). */
	idempotent: boolean
	/** Human-readable step label used in log events and error messages. */
	step: string
	/** Injected KpsdkClient — real impl lands in Epic 14, stub in kpsdkClient.types.ts. */
	kpsdkClient: { refresh(page: Page): Promise<void> }
	/** Re-authenticates the session (Epic 2). */
	sessionRefresh: () => Promise<void>
	logger: {
		warn: (msg: string, meta: object) => void
		error: (msg: string, meta: object) => void
	}
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
	new Promise((r) => setTimeout(r, ms))

const statusOf = (e: unknown): number | undefined =>
	typeof e === 'object' && e !== null && 'status' in e
		? (e as { status: unknown }).status as number | undefined
		: undefined

const parseRetryAfter = (e: unknown): number => {
	if (
		typeof e !== 'object' ||
		e === null ||
		!('headers' in e) ||
		typeof (e as { headers: unknown }).headers !== 'object' ||
		(e as { headers: unknown }).headers === null
	) {
		return 1
	}
	const headers = (e as { headers: Record<string, string> }).headers
	const v = headers['retry-after']
	if (!v) return 1
	const n = parseInt(v, 10)
	return Number.isFinite(n) ? Math.min(n, 5) : 1
}

const errorClassName = (e: unknown): string => {
	if (e instanceof Error) return e.constructor.name
	return typeof e
}

// ---------------------------------------------------------------------------
// Retry helpers — each performs exactly ONE retry attempt.
// ---------------------------------------------------------------------------

async function retryAfterKpsdk<T>(
	fn: () => Promise<T>,
	ctx: RetryContext,
): Promise<T> {
	ctx.logger.warn('api_retry', {
		event: 'api_retry',
		step: ctx.step,
		errorClass: 'KpsdkBlock',
		attempt: 1,
	})
	await ctx.kpsdkClient.refresh(ctx.page)
	try {
		return await fn()
	} catch (e2) {
		if (statusOf(e2) === 403) {
			ctx.logger.error('api_retry_exhausted', {
				event: 'api_retry_exhausted',
				step: ctx.step,
				errorClass: 'KpsdkBlockedError',
				blockReason: 'blocked',
			})
			throw new KpsdkBlockedError(ctx.step)
		}
		throw e2
	}
}

async function retryAfterBackoff<T>(
	fn: () => Promise<T>,
	ctx: RetryContext,
	originalError: unknown,
): Promise<T> {
	const sec = parseRetryAfter(originalError)
	ctx.logger.warn('api_retry', {
		event: 'api_retry',
		step: ctx.step,
		errorClass: 'RateLimit',
		attempt: 1,
		retryAfterSec: sec,
	})
	await sleep(sec * 1000)
	try {
		return await fn()
	} catch (e2) {
		if (statusOf(e2) === 429) {
			ctx.logger.error('api_retry_exhausted', {
				event: 'api_retry_exhausted',
				step: ctx.step,
				errorClass: 'RateLimitedError',
				blockReason: 'rate_limited',
			})
			throw new RateLimitedError(ctx.step, sec)
		}
		throw e2
	}
}

async function retryIfIdempotent<T>(
	fn: () => Promise<T>,
	ctx: RetryContext,
	status: number,
): Promise<T> {
	if (!ctx.idempotent) {
		// Non-idempotent 5xx (e.g. PATCH /buy/carts ATC) must NOT be retried —
		// Nike may have processed the request already. Throw immediately.
		ctx.logger.error('api_retry_exhausted', {
			event: 'api_retry_exhausted',
			step: ctx.step,
			errorClass: 'ServerError',
			blockReason: 'submit_failed',
			note: 'non-idempotent, no retry',
		})
		throw new ServerError(ctx.step, status)
	}
	ctx.logger.warn('api_retry', {
		event: 'api_retry',
		step: ctx.step,
		errorClass: 'ServerError',
		attempt: 1,
		status,
	})
	await sleep(200)
	try {
		return await fn()
	} catch (e2) {
		const s2 = statusOf(e2)
		if (s2 !== undefined && s2 >= 500 && s2 < 600) {
			ctx.logger.error('api_retry_exhausted', {
				event: 'api_retry_exhausted',
				step: ctx.step,
				errorClass: 'ServerError',
				blockReason: 'submit_failed',
			})
			throw new ServerError(ctx.step, s2)
		}
		throw e2
	}
}

async function retryAfterSessionRefresh<T>(
	fn: () => Promise<T>,
	ctx: RetryContext,
): Promise<T> {
	ctx.logger.warn('api_retry', {
		event: 'api_retry',
		step: ctx.step,
		errorClass: 'SessionExpired',
		attempt: 1,
	})
	await ctx.sessionRefresh()
	try {
		return await fn()
	} catch (e2) {
		if (statusOf(e2) === 401) {
			ctx.logger.error('api_retry_exhausted', {
				event: 'api_retry_exhausted',
				step: ctx.step,
				errorClass: 'SessionExpiredError',
				blockReason: 'session_expired',
			})
			throw new SessionExpiredError(ctx.step)
		}
		throw e2
	}
}

// ---------------------------------------------------------------------------
// Public envelope
// ---------------------------------------------------------------------------

/**
 * Wraps a single Nike API call with the standard retry policy:
 *  - 403  → KPSDK refresh + one retry  → KpsdkBlockedError on exhaustion
 *  - 429  → honour Retry-After (capped 5 s) + one retry  → RateLimitedError
 *  - 5xx  → one retry after 200 ms IF idempotent, else immediate ServerError
 *  - 401  → sessionRefresh() + one retry  → SessionExpiredError on exhaustion
 *  - other → propagated unchanged (no swallow)
 *
 * MAX one extra round-trip per error class. NFR1 30 s budget relies on this.
 */
export const withApiRetry = async <T>(
	fn: () => Promise<T>,
	ctx: RetryContext,
): Promise<T> => {
	try {
		return await fn()
	} catch (e) {
		const status = statusOf(e)
		if (status === 403) return retryAfterKpsdk(fn, ctx)
		if (status === 429) return retryAfterBackoff(fn, ctx, e)
		if (status !== undefined && status >= 500 && status < 600)
			return retryIfIdempotent(fn, ctx, status)
		if (status === 401) return retryAfterSessionRefresh(fn, ctx)
		// Unhandled error — log and propagate (AC: no swallow).
		ctx.logger.error('unhandled_api_error', {
			event: 'unhandled_api_error',
			step: ctx.step,
			errorClass: errorClassName(e),
			status,
		})
		throw e
	}
}

// ---------------------------------------------------------------------------
// Convenience: wrapStep bakes step + idempotent into a partial RetryContext
// ---------------------------------------------------------------------------

/**
 * Returns a helper that calls withApiRetry with a pre-filled step label and
 * idempotent flag, keeping call sites concise.
 *
 * Usage:
 *   const wrap = wrapStep(retryCtx)
 *   const view = await wrap('open-shipping-view', true, () => api.openView(…))
 */
export const wrapStep =
	(baseCtx: Omit<RetryContext, 'step' | 'idempotent'>) =>
	<T>(step: string, idempotent: boolean, fn: () => Promise<T>): Promise<T> =>
		withApiRetry(fn, { ...baseCtx, step, idempotent })
