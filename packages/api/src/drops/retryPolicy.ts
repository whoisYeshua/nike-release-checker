// Retry policy — Story 17.3
// Ported from packages/bot/src/checkout/retryController.ts.
// Do NOT import from packages/bot — keeping the policy colocated with the API
// package lets the SaaS tier evolve independently.

/** Hard cap on total attempts (initial + retries). */
export const MAX_ATTEMPTS = 3

/**
 * Error classifications that qualify a failed run for a retry.
 * Matches v2 Story 11.5 semantics.
 */
const RETRYABLE_CLASSIFICATIONS = new Set<string>([
  'blocked',
  '3ds_timeout',
  'error',
])

/**
 * Returns true when a failed run with the given classification should be
 * re-queued, provided `currentAttempt < MAX_ATTEMPTS`.
 */
export function isRetryable(classification: string): boolean {
  return RETRYABLE_CLASSIFICATIONS.has(classification)
}

/**
 * Returns true when it is valid to insert a new WAITING row with
 * `attempt = currentAttempt + 1`.
 */
export function shouldRetry(
  classification: string,
  currentAttempt: number,
): boolean {
  return isRetryable(classification) && currentAttempt < MAX_ATTEMPTS
}
