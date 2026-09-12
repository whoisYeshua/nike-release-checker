// Drop dispatch handler — Story 17.3
// Resolves accounts_filter for a drop and inserts one WAITING drop_run row
// per qualifying nike account.
//
// accounts_filter shape (from drops.accounts_filter JSONB column):
//   { type: 'all' }                   — all valid accounts for the customer
//   { type: 'list'; ids: string[] }   — explicit account list

import { dropsDb } from '../db/drops.ts'
import { dropRunRepository, allRunsTerminal } from './dropRunRepository.ts'
import { transitionState } from './dropRepository.ts'
import type { BrowserContextHandle } from '../warmup/warmupCoordinator.ts'

// ---------------------------------------------------------------------------
// In-memory nike_accounts stub
// Replaced by a real `nikeAccountsDb` when Epic 16 / Story 16.1 lands.
// ---------------------------------------------------------------------------

export interface NikeAccountRow {
  id: string
  customer_id: string
  session_state: 'valid' | 'expired' | 'banned'
}

const nikeAccountsStore: NikeAccountRow[] = []

export function _seedNikeAccount(account: NikeAccountRow): void {
  nikeAccountsStore.push(account)
}

export function _resetNikeAccounts(): void {
  nikeAccountsStore.length = 0
}

function resolveAccounts(
  customerId: string,
  accountsFilter: AccountsFilter,
): NikeAccountRow[] {
  if (accountsFilter.type === 'all') {
    return nikeAccountsStore.filter(
      (a) => a.customer_id === customerId && a.session_state === 'valid',
    )
  }
  return nikeAccountsStore.filter(
    (a) =>
      a.customer_id === customerId &&
      a.session_state === 'valid' &&
      accountsFilter.ids.includes(a.id),
  )
}

// ---------------------------------------------------------------------------
// accounts_filter type
// ---------------------------------------------------------------------------

export type AccountsFilter =
  | { type: 'all' }
  | { type: 'list'; ids: string[] }

function parseAccountsFilter(raw: unknown): AccountsFilter {
  if (raw == null || typeof raw !== 'object') return { type: 'all' }
  const obj = raw as Record<string, unknown>
  if (obj['type'] === 'list' && Array.isArray(obj['ids'])) {
    return { type: 'list', ids: obj['ids'] as string[] }
  }
  return { type: 'all' }
}

// ---------------------------------------------------------------------------
// dispatchDrop
// ---------------------------------------------------------------------------

export interface DispatchOpts {
  /**
   * Pre-launched Playwright contexts from WarmupCoordinator (Story 17.5).
   * When present, workers reuse these instead of creating new contexts.
   * Keyed by nikeAccountId. The worker that finalizes a run is responsible
   * for calling ctx.close() — not the dispatcher.
   */
  preLaunchedContexts?: Map<string, BrowserContextHandle>
}

export interface DispatchDeps {
  logger?: {
    info(data: Record<string, unknown>, msg: string): void
    warn(data: Record<string, unknown>, msg: string): void
  }
}

function defaultLogger() {
  return {
    info(data: Record<string, unknown>, msg: string): void {
      console.log(JSON.stringify({ ...data, msg }))
    },
    warn(data: Record<string, unknown>, msg: string): void {
      console.warn(JSON.stringify({ ...data, msg }))
    },
  }
}

/**
 * Resolve which nike accounts participate in this drop and insert one
 * WAITING drop_run row per account.
 *
 * Emits `drop.dispatched` event (Story 17.4 WS stream will consume this).
 */
export async function dispatchDrop(
  dropId: string,
  opts?: DispatchOpts & DispatchDeps,
): Promise<void> {
  const logger = opts?.logger ?? defaultLogger()
  // opts.preLaunchedContexts: Pre-launched Playwright contexts from WarmupCoordinator.
  // The worker pool (Story 17.3+) reads opts.preLaunchedContexts.get(nikeAccountId)
  // before creating a new context. Currently stored on opts — workers access via opts directly.
  // (No local variable here to avoid noUnusedLocals.)

  // We look up the drop without customer scoping because the scheduler owns
  // the call site and the drop is already trusted-ACTIVE.
  let drop: ReturnType<typeof dropsDb.findById> | undefined
  // Search across all customers — findById requires customerId, so scan
  for (const state of ['ACTIVE'] as const) {
    const found = dropsDb.findByStates([state]).find((r) => r.id === dropId)
    if (found) {
      drop = found
      break
    }
  }

  if (drop == null) {
    logger.warn({ dropId }, 'dispatch.drop_not_found')
    return
  }

  // accounts_filter lives in the DB schema; DropRow in-memory doesn't have
  // this field yet (Story 16.1 adds it). Cast to access if present.
  const rawFilter = (drop as unknown as Record<string, unknown>)['accounts_filter']
  const filter = parseAccountsFilter(rawFilter)

  const accounts = resolveAccounts(drop.customer_id, filter)

  if (accounts.length === 0) {
    logger.warn({ dropId, customerId: drop.customer_id }, 'dispatch.no_accounts')
  }

  for (const account of accounts) {
    await dropRunRepository.insertWaiting({
      dropId: drop.id,
      nikeAccountId: account.id,
      customerId: drop.customer_id,
      attempt: 1,
    })
  }

  logger.info(
    { dropId, customerId: drop.customer_id, count: accounts.length, event: 'drop.dispatched' },
    'dispatch.dispatched',
  )
}

/**
 * Called by a worker after it finalises a run.
 * If all runs for the drop are terminal, transitions the drop to COMPLETED.
 */
export async function checkDropCompletion(
  dropId: string,
  customerId: string,
  workerId: string,
  deps?: DispatchDeps,
): Promise<boolean> {
  const logger = deps?.logger ?? defaultLogger()

  if (!allRunsTerminal(dropId)) return false

  try {
    transitionState(dropId, 'COMPLETED', `worker:${workerId}`, customerId)
    logger.info({ dropId, workerId }, 'drop.completed')
  } catch (err) {
    // May already be COMPLETED if two workers race — treat as success
    logger.warn({ dropId, err: String(err) }, 'drop.completion.skip')
  }

  return true
}
