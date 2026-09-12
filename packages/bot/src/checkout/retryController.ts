import type { CheckoutResult } from '../tui/SummaryScreen.tsx'
import type { ReportStatus } from '../logger/reportWriter.ts'

/**
 * Hard cap on attempts per account, including the original attempt.
 * An account starts at attempt 1 (the initial drop); up to 2 retries
 * are permitted before canRetry returns false.
 */
export const MAX_ATTEMPTS = 3

/**
 * Stateful controller that tracks per-account retry attempts and exposes
 * policy decisions for the retry flow.
 *
 * Semantics:
 * - `attempts` map records how many attempts (original + retries) an
 *   account has accumulated. Unseen accounts are implicitly at 1.
 * - `canRetry(id)` returns true while the account has not yet reached
 *   MAX_ATTEMPTS.
 * - `recordAttempt(id)` is called when a retry is kicked off; it
 *   increments the count.
 * - `filterRetriable(failed)` drops any account that has hit the cap.
 * - `shouldRotateProxy(status)` encodes the proxy-rotation policy:
 *   BLOCKED/ERROR rotate, THREEDS_TIMEOUT preserves the session
 *   so the user's original 3DS challenge flow can resume cleanly.
 */
export class RetryController {
	private attempts = new Map<string, number>()

	/** Current attempt count for an account (1 if never recorded). */
	getAttempts(accountId: string): number {
		return this.attempts.get(accountId) ?? 1
	}

	/** True while the account has budget remaining for another attempt. */
	canRetry(accountId: string): boolean {
		return this.getAttempts(accountId) < MAX_ATTEMPTS
	}

	/** Increment the attempt counter for an account. */
	recordAttempt(accountId: string): void {
		const next = this.getAttempts(accountId) + 1
		this.attempts.set(accountId, next)
	}

	/** Filter a failed-result list down to accounts that still have retry budget. */
	filterRetriable<T extends { accountId: string }>(failed: T[]): T[] {
		return failed.filter((r) => this.canRetry(r.accountId))
	}

	/**
	 * Proxy-rotation policy.
	 * BLOCKED and ERROR suggest the current proxy/IP is compromised → rotate.
	 * THREEDS_TIMEOUT is a user-side signal; we preserve the session/proxy
	 * so cookies and the pending 3DS flow aren't thrown away.
	 */
	shouldRotateProxy(status: ReportStatus): boolean {
		if (status === 'BLOCKED' || status === 'ERROR') return true
		if (status === 'THREEDS_TIMEOUT') return false
		return false
	}
}

export type { CheckoutResult }
