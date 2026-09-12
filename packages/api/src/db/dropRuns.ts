/**
 * dropRuns DB helpers — Story 16.4
 *
 * Thin adapter that bridges the Nike accounts DELETE guard to the in-memory
 * DropRunRepository used by Epic 17.
 *
 * `hasInFlight(nikeAccountId)` returns true when the account is referenced by
 * a run in state WAITING or COPPING (i.e. an in-flight drop_run).
 * The DELETE endpoint uses this to return HTTP 409 per AC.
 */

import { dropRunRepository } from '../drops/dropRunRepository.ts'

/**
 * Returns true when `nikeAccountId` is referenced by at least one drop run
 * whose state is WAITING or COPPING.
 *
 * INTERNAL USE ONLY — called by the Nike accounts DELETE route.
 */
export function hasInFlight(nikeAccountId: string): boolean {
  return dropRunRepository.hasInFlight(nikeAccountId)
}
