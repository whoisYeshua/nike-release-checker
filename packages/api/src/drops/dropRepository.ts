// Drop repository — Story 17.1
// Wraps the in-memory drops store (db/drops.ts) and enforces lifecycle
// transitions via the state machine. When Postgres lands (Story 16.1),
// this module will be updated to use a PoolClient; the public API stays stable.

import type { DropRow } from '../db/drops.ts'
import { dropsDb } from '../db/drops.ts'
import { type DropState, assertTransition } from './dropStateMachine.ts'

export interface AuditRow {
  drop_id: string
  from_state: DropState
  to_state: DropState
  actor: string
  reason: string | undefined
  occurred_at: string
}

// In-memory audit log — replaced by Postgres write in Story 16.x
const auditLog: AuditRow[] = []

/**
 * Transition a drop to a new state, writing an audit row atomically.
 *
 * @param dropId   - The drop UUID (or in-memory drp_ id)
 * @param to       - Target state
 * @param actor    - Actor string (e.g. 'customer:cust_xyz', 'scheduler:tick')
 * @param reason   - Optional human-readable reason
 * @param customerId - Scopes the lookup to a single tenant
 * @returns The updated DropRow
 * @throws {InvalidDropTransitionError} if the transition is not allowed
 * @throws {Error} if the drop is not found
 */
export function transitionState(
  dropId: string,
  to: DropState,
  actor: string,
  customerId: string,
  reason?: string,
): DropRow {
  const row = dropsDb.findById(dropId, customerId)
  if (row == null) {
    throw new Error(`Drop not found: ${dropId}`)
  }

  const from = row.state as DropState

  // Throws InvalidDropTransitionError if invalid
  assertTransition(from, to)

  const updated = dropsDb.updateState(dropId, customerId, [from], to)
  if (updated == null) {
    // Race condition — should not happen in single-process in-memory store
    throw new Error(`State transition race: drop ${dropId} moved before update`)
  }

  // Write audit row (append-only)
  auditLog.push({
    drop_id: dropId,
    from_state: from,
    to_state: to,
    actor,
    reason,
    occurred_at: new Date().toISOString(),
  })

  return updated
}

/**
 * Read-only accessor for the audit log.
 * Returns all audit rows for a given drop (chronological order).
 */
export function getAuditLog(dropId: string): readonly AuditRow[] {
  return auditLog.filter((r) => r.drop_id === dropId)
}

/** For testing only */
export function _resetAuditLog(): void {
  auditLog.length = 0
}
