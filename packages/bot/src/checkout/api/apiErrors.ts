// Envelope-level typed error classes for Story 12.9 (API error handling).
// These are DISTINCT from per-story errors (e.g. CheckoutKpsdkBlockedError).
// Story-level errors are caught by withApiRetry and re-thrown as one of these
// after retry exhaustion.
//
// NOTE: erasableSyntaxOnly=true — no constructor parameter properties.

export class KpsdkBlockedError extends Error {
	readonly step: string

	constructor(step: string) {
		super(`KPSDK block at ${step} after refresh+retry`)
		this.name = 'KpsdkBlockedError'
		this.step = step
	}
}

export class RateLimitedError extends Error {
	readonly step: string
	readonly retryAfterSec: number

	constructor(step: string, retryAfterSec: number) {
		super(`429 at ${step} after backoff+retry (retry-after=${retryAfterSec}s)`)
		this.name = 'RateLimitedError'
		this.step = step
		this.retryAfterSec = retryAfterSec
	}
}

export class ServerError extends Error {
	readonly step: string
	readonly status: number

	constructor(step: string, status: number) {
		super(`${status} at ${step}`)
		this.name = 'ServerError'
		this.step = step
		this.status = status
	}
}

export class SessionExpiredError extends Error {
	readonly step: string

	constructor(step: string) {
		super(`401 at ${step} after session refresh+retry`)
		this.name = 'SessionExpiredError'
		this.step = step
	}
}
