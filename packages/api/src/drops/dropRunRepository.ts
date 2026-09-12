// Drop run repository — Story 17.3
// In-memory store; replaced by Postgres (SELECT … FOR UPDATE SKIP LOCKED)
// when the real DB layer lands. Public interface is stable.

import { randomUUID } from 'node:crypto'
import { shouldRetry } from './retryPolicy.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DropRunState = 'WAITING' | 'COPPING' | 'COP' | 'FAIL' | 'SKIPPED'

export interface DropRun {
  id: string
  drop_id: string
  nike_account_id: string
  customer_id: string
  state: DropRunState
  attempt: number
  worker_id: string | null
  leased_at: string | null
  started_at: string | null
  finished_at: string | null
  order_number: string | null
  error_reason: string | null
  error_classification: string | null
  created_at: string
}

export interface FinalizeMeta {
  orderNumber?: string
  errorReason?: string
  errorClassification?: string
  skipReason?: string
}

export interface DropRunRepository {
  insertWaiting(args: {
    dropId: string
    nikeAccountId: string
    customerId: string
    attempt: number
  }): Promise<DropRun>

  /**
   * Atomically claim the next WAITING run for the given worker.
   * Returns null when no WAITING run is available.
   *
   * In-memory implementation serialises via a synchronous critical section
   * (JS single-threaded) simulating SKIP LOCKED isolation.
   * The real Postgres impl uses:
   *   WITH leased AS (
   *     SELECT id FROM drop_runs
   *      WHERE state = 'WAITING' ORDER BY created_at ASC
   *      FOR UPDATE SKIP LOCKED LIMIT 1
   *   )
   *   UPDATE drop_runs SET state='COPPING', worker_id=$1,
   *          leased_at=now(), started_at=now()
   *   WHERE id IN (SELECT id FROM leased) RETURNING *;
   */
  leaseNext(workerId: string): Promise<DropRun | null>

  /**
   * Transition a run to COP, FAIL, or SKIPPED.
   * On FAIL with retryable classification and attempt < 3, re-inserts a
   * WAITING row with attempt+1.
   */
  finalize(
    runId: string,
    outcome: 'COP' | 'FAIL' | 'SKIPPED',
    meta: FinalizeMeta,
  ): Promise<void>

  /**
   * Reap runs stuck in COPPING for longer than `staleThresholdMs` ms
   * (default 5 minutes). Returns the number of runs reaped.
   * Reaped runs are returned to WAITING; attempt count is unchanged.
   */
  reapStale(staleThresholdMs?: number): Promise<number>

  listByDrop(dropId: string): Promise<DropRun[]>

  /**
   * Returns true when the given Nike account is referenced by at least one
   * drop run whose state is WAITING or COPPING (i.e. the account is in-flight).
   *
   * Called by the Nike accounts DELETE route to return HTTP 409.
   */
  hasInFlight(nikeAccountId: string): boolean
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

const DEFAULT_STALE_MS = 5 * 60 * 1_000 // 5 minutes

const store = new Map<string, DropRun>()

/**
 * Tracks unique (drop_id, nike_account_id, attempt) combinations to enforce
 * the UNIQUE INDEX constraint in the in-memory store.
 */
const uniqueAttemptIndex = new Set<string>()

function uniqueKey(
  dropId: string,
  nikeAccountId: string,
  attempt: number,
): string {
  return `${dropId}|${nikeAccountId}|${attempt}`
}

export const dropRunRepository: DropRunRepository = {
  async insertWaiting({ dropId, nikeAccountId, customerId, attempt }) {
    const key = uniqueKey(dropId, nikeAccountId, attempt)
    if (uniqueAttemptIndex.has(key)) {
      // Idempotent on duplicate — mirrors the ON CONFLICT behaviour the Postgres
      // layer will provide via the UNIQUE INDEX.
      const existing = [...store.values()].find(
        (r) =>
          r.drop_id === dropId &&
          r.nike_account_id === nikeAccountId &&
          r.attempt === attempt,
      )
      if (existing != null) return existing
    }

    const run: DropRun = {
      id: randomUUID(),
      drop_id: dropId,
      nike_account_id: nikeAccountId,
      customer_id: customerId,
      state: 'WAITING',
      attempt,
      worker_id: null,
      leased_at: null,
      started_at: null,
      finished_at: null,
      order_number: null,
      error_reason: null,
      error_classification: null,
      created_at: new Date().toISOString(),
    }

    store.set(run.id, run)
    uniqueAttemptIndex.add(key)
    return run
  },

  async leaseNext(workerId) {
    // Oldest WAITING run first — mirrors ORDER BY created_at ASC in the SQL
    const waiting = [...store.values()]
      .filter((r) => r.state === 'WAITING')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))

    const run = waiting[0]
    if (run == null) return null

    const now = new Date().toISOString()
    const claimed: DropRun = {
      ...run,
      state: 'COPPING',
      worker_id: workerId,
      leased_at: now,
      started_at: now,
    }
    store.set(claimed.id, claimed)
    return claimed
  },

  async finalize(runId, outcome, meta) {
    const run = store.get(runId)
    if (run == null) throw new Error(`DropRun not found: ${runId}`)

    const now = new Date().toISOString()
    const updated: DropRun = {
      ...run,
      state: outcome,
      finished_at: now,
      order_number: meta.orderNumber ?? null,
      error_reason: meta.errorReason ?? meta.skipReason ?? null,
      error_classification: meta.errorClassification ?? null,
    }
    store.set(runId, updated)

    // Re-queue on retryable FAIL
    if (
      outcome === 'FAIL' &&
      meta.errorClassification != null &&
      shouldRetry(meta.errorClassification, run.attempt)
    ) {
      await dropRunRepository.insertWaiting({
        dropId: run.drop_id,
        nikeAccountId: run.nike_account_id,
        customerId: run.customer_id,
        attempt: run.attempt + 1,
      })
    }
  },

  async reapStale(staleThresholdMs = DEFAULT_STALE_MS) {
    const cutoff = new Date(Date.now() - staleThresholdMs).toISOString()
    let count = 0

    for (const run of store.values()) {
      if (run.state === 'COPPING' && run.leased_at != null && run.leased_at <= cutoff) {
        const reaped: DropRun = {
          ...run,
          state: 'WAITING',
          worker_id: null,
          leased_at: null,
          // started_at preserved so we can see when the original lease began
        }
        store.set(run.id, reaped)
        count++

        console.log(
          JSON.stringify({
            event: 'drop_run.reaped',
            run_id: run.id,
            previous_worker_id: run.worker_id,
          }),
        )
      }
    }

    return count
  },

  async listByDrop(dropId) {
    return [...store.values()]
      .filter((r) => r.drop_id === dropId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  hasInFlight(nikeAccountId) {
    for (const run of store.values()) {
      if (run.nike_account_id === nikeAccountId &&
          (run.state === 'WAITING' || run.state === 'COPPING')) {
        return true
      }
    }
    return false
  },
}

/**
 * Check whether all runs for a drop have reached a terminal state.
 * Used by dispatchDrop to detect drop completion.
 */
export function allRunsTerminal(dropId: string): boolean {
  const runs = [...store.values()].filter((r) => r.drop_id === dropId)
  if (runs.length === 0) return false
  return runs.every((r) => r.state === 'COP' || r.state === 'FAIL' || r.state === 'SKIPPED')
}

/** For testing only */
export function _resetDropRunStore(): void {
  store.clear()
  uniqueAttemptIndex.clear()
}
