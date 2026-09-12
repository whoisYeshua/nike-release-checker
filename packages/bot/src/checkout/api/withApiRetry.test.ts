// Tests for withApiRetry envelope — Story 12.9.
// Pattern: node:test + node:assert, ESM, tabs, .ts extensions.
// Sleep is patched via fake timers where needed to keep the suite fast.

import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import { withApiRetry, type RetryContext } from './withApiRetry.ts'
import {
	KpsdkBlockedError,
	RateLimitedError,
	ServerError,
	SessionExpiredError,
} from './apiErrors.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Page stub — only `reload` is ever called in these tests. */
function makePage(): Page {
	return {
		reload: async () => {},
	} as unknown as Page
}

/** Error shape that mimics NikeCartApiError (has .status and .headers). */
function apiErr(
	status: number,
	headers: Record<string, string> = {},
): Error & { status: number; headers: Record<string, string> } {
	const e = new Error(`mock ${status}`) as Error & {
		status: number
		headers: Record<string, string>
	}
	e.status = status
	e.headers = headers
	return e
}

interface CtxOverrides {
	kpsdkRefreshCalls?: number[]
	sessionRefreshCalls?: number[]
	warnLogs?: Array<[string, object]>
	errorLogs?: Array<[string, object]>
}

function makeCtx(overrides: CtxOverrides = {}): RetryContext {
	const kpsdkRefreshCalls = overrides.kpsdkRefreshCalls ?? []
	const sessionRefreshCalls = overrides.sessionRefreshCalls ?? []
	const warnLogs = overrides.warnLogs ?? []
	const errorLogs = overrides.errorLogs ?? []

	return {
		page: makePage(),
		idempotent: true,
		step: 'test-step',
		kpsdkClient: {
			refresh: async (_page: Page): Promise<void> => {
				kpsdkRefreshCalls.push(Date.now())
			},
		},
		sessionRefresh: async (): Promise<void> => {
			sessionRefreshCalls.push(Date.now())
		},
		logger: {
			warn: (msg: string, meta: object): void => {
				warnLogs.push([msg, meta])
			},
			error: (msg: string, meta: object): void => {
				errorLogs.push([msg, meta])
			},
		},
	}
}

// Patch global setTimeout to skip actual delays in tests.
// We replace it with a version that calls the callback immediately
// so 429-backoff tests don't wait real seconds.
let originalSetTimeout: typeof setTimeout

before(() => {
	originalSetTimeout = globalThis.setTimeout
	// biome-ignore lint/suspicious/noExplicitAny: patching global for test speed
	;(globalThis as unknown as Record<string, unknown>)['setTimeout'] = (
		fn: () => void,
		_ms: number,
	): ReturnType<typeof setTimeout> => {
		// Execute synchronously (in the same microtask chain via Promise.resolve)
		Promise.resolve().then(fn)
		return 0 as unknown as ReturnType<typeof setTimeout>
	}
})

after(() => {
	globalThis.setTimeout = originalSetTimeout
})

// ---------------------------------------------------------------------------
// 403 — KPSDK refresh path
// ---------------------------------------------------------------------------

describe('withApiRetry — 403 KPSDK paths', () => {
	it('403 → kpsdk.refresh called → retry succeeds → returns value', async () => {
		const kpsdkRefreshCalls: number[] = []
		const ctx = makeCtx({ kpsdkRefreshCalls })
		let callCount = 0

		const result = await withApiRetry(async () => {
			callCount++
			if (callCount === 1) throw apiErr(403)
			return 'ok'
		}, ctx)

		assert.equal(result, 'ok')
		assert.equal(callCount, 2)
		assert.equal(kpsdkRefreshCalls.length, 1)
	})

	it('403 → refresh → retry also 403 → throws KpsdkBlockedError', async () => {
		const ctx = makeCtx()
		let callCount = 0

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					callCount++
					throw apiErr(403)
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof KpsdkBlockedError)
				assert.equal(err.step, 'test-step')
				return true
			},
		)
		assert.equal(callCount, 2)
	})

	it('403 → refresh → retry throws non-403 → propagates original non-403 error', async () => {
		const ctx = makeCtx()
		let callCount = 0

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					callCount++
					if (callCount === 1) throw apiErr(403)
					throw apiErr(500)
				}, ctx),
			(err: unknown) => {
				// Should NOT be KpsdkBlockedError — propagate the 500 from retry
				assert.ok(!(err instanceof KpsdkBlockedError))
				assert.equal((err as { status?: number }).status, 500)
				return true
			},
		)
	})
})

// ---------------------------------------------------------------------------
// 429 — Rate limit backoff path
// ---------------------------------------------------------------------------

describe('withApiRetry — 429 rate-limit paths', () => {
	it('429 with retry-after:2 → waits → retry succeeds → returns value', async () => {
		const warnLogs: Array<[string, object]> = []
		const ctx = makeCtx({ warnLogs })
		let callCount = 0

		const result = await withApiRetry(async () => {
			callCount++
			if (callCount === 1) throw apiErr(429, { 'retry-after': '2' })
			return 'rate-limit-recovered'
		}, ctx)

		assert.equal(result, 'rate-limit-recovered')
		assert.equal(callCount, 2)
		// Verify backoff was logged
		assert.ok(warnLogs.some(([msg]) => msg === 'api_retry'))
	})

	it('429 → 429 → throws RateLimitedError with correct step and retryAfterSec', async () => {
		const ctx = makeCtx()
		let callCount = 0

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					callCount++
					throw apiErr(429, { 'retry-after': '3' })
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof RateLimitedError)
				assert.equal(err.step, 'test-step')
				assert.equal(err.retryAfterSec, 3)
				return true
			},
		)
		assert.equal(callCount, 2)
	})

	it('caps retry-after at 5 seconds', async () => {
		const ctx = makeCtx()

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					throw apiErr(429, { 'retry-after': '99' })
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof RateLimitedError)
				assert.equal(err.retryAfterSec, 5)
				return true
			},
		)
	})

	it('defaults to 1 s when retry-after header is absent', async () => {
		const ctx = makeCtx()

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					throw apiErr(429) // no retry-after header
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof RateLimitedError)
				assert.equal(err.retryAfterSec, 1)
				return true
			},
		)
	})
})

// ---------------------------------------------------------------------------
// 5xx — Server error idempotent path
// ---------------------------------------------------------------------------

describe('withApiRetry — 5xx idempotent paths', () => {
	it('500 idempotent=true → retry succeeds → returns value', async () => {
		const ctx = makeCtx()
		ctx.idempotent = true
		let callCount = 0

		const result = await withApiRetry(async () => {
			callCount++
			if (callCount === 1) throw apiErr(500)
			return 'server-recovered'
		}, ctx)

		assert.equal(result, 'server-recovered')
		assert.equal(callCount, 2)
	})

	it('500 idempotent=true → second 500 → throws ServerError', async () => {
		const ctx = makeCtx()
		ctx.idempotent = true

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					throw apiErr(500)
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof ServerError)
				assert.equal(err.step, 'test-step')
				assert.equal(err.status, 500)
				return true
			},
		)
	})

	it('503 idempotent=true → second 503 → ServerError carries correct status', async () => {
		const ctx = makeCtx()
		ctx.idempotent = true

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					throw apiErr(503)
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof ServerError)
				assert.equal((err as ServerError).status, 503)
				return true
			},
		)
	})

	it('500 idempotent=false → throws ServerError immediately (no retry)', async () => {
		const ctx = makeCtx()
		ctx.idempotent = false
		let callCount = 0

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					callCount++
					throw apiErr(500)
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof ServerError)
				return true
			},
		)
		// Must NOT have retried
		assert.equal(callCount, 1)
	})
})

// ---------------------------------------------------------------------------
// 401 — Session refresh path
// ---------------------------------------------------------------------------

describe('withApiRetry — 401 session refresh paths', () => {
	it('401 → sessionRefresh → retry succeeds → returns value', async () => {
		const sessionRefreshCalls: number[] = []
		const ctx = makeCtx({ sessionRefreshCalls })
		let callCount = 0

		const result = await withApiRetry(async () => {
			callCount++
			if (callCount === 1) throw apiErr(401)
			return 'session-recovered'
		}, ctx)

		assert.equal(result, 'session-recovered')
		assert.equal(callCount, 2)
		assert.equal(sessionRefreshCalls.length, 1)
	})

	it('401 → sessionRefresh → retry also 401 → throws SessionExpiredError', async () => {
		const ctx = makeCtx()

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					throw apiErr(401)
				}, ctx),
			(err: unknown) => {
				assert.ok(err instanceof SessionExpiredError)
				assert.equal(err.step, 'test-step')
				return true
			},
		)
	})
})

// ---------------------------------------------------------------------------
// Non-HTTP errors — propagation (no swallow)
// ---------------------------------------------------------------------------

describe('withApiRetry — non-HTTP error propagation', () => {
	it('plain Error (no .status) propagates unchanged', async () => {
		const ctx = makeCtx()
		const original = new Error('playwright connection reset')

		await assert.rejects(
			() => withApiRetry(async () => { throw original }, ctx),
			(err: unknown) => {
				assert.strictEqual(err, original)
				return true
			},
		)
	})

	it('error with status 404 propagates unchanged (not retried)', async () => {
		const ctx = makeCtx()
		let callCount = 0

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					callCount++
					throw apiErr(404)
				}, ctx),
			(err: unknown) => {
				assert.equal((err as { status?: number }).status, 404)
				assert.ok(!(err instanceof KpsdkBlockedError))
				assert.ok(!(err instanceof ServerError))
				return true
			},
		)
		assert.equal(callCount, 1)
	})

	it('logs unhandled_api_error event for non-HTTP errors', async () => {
		const errorLogs: Array<[string, object]> = []
		const ctx = makeCtx({ errorLogs })

		await assert.rejects(
			() =>
				withApiRetry(async () => {
					throw new TypeError('unexpected')
				}, ctx),
		)

		assert.ok(errorLogs.some(([msg]) => msg === 'unhandled_api_error'))
	})
})

// ---------------------------------------------------------------------------
// Logging — structured events emitted on retry/exhaustion
// ---------------------------------------------------------------------------

describe('withApiRetry — structured logging', () => {
	it('emits api_retry warn on first 403', async () => {
		const warnLogs: Array<[string, object]> = []
		const ctx = makeCtx({ warnLogs })
		let n = 0
		await withApiRetry(async () => {
			if (n++ === 0) throw apiErr(403)
			return true
		}, ctx)
		assert.ok(warnLogs.some(([msg]) => msg === 'api_retry'))
	})

	it('emits api_retry_exhausted error on double-403', async () => {
		const errorLogs: Array<[string, object]> = []
		const ctx = makeCtx({ errorLogs })
		await assert.rejects(() =>
			withApiRetry(async () => { throw apiErr(403) }, ctx),
		)
		assert.ok(errorLogs.some(([msg]) => msg === 'api_retry_exhausted'))
	})
})
