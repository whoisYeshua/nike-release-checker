// Warmup Coordinator — Story 17.5
// Ports v2 `packages/bot/src/monitor/warmupMode.ts` phased warmup into the
// SaaS worker pool. Runs on the API node; operates against DB-backed drops.
//
// Phases (mirroring v2 WarmupController):
//   T-5  polling   — poll SDK feed until slug resolves
//   T-3  sessions  — validate OIDC sessions per account
//   T-1  contexts  — pre-launch Playwright contexts per valid account
//   T=0  ready     — transition ACTIVE, resolve arm()

import { dropsDb } from '../db/drops.ts'
import { transitionState } from '../drops/dropRepository.ts'
import { dropRunRepository } from '../drops/dropRunRepository.ts'
import { dropEventBus } from '../events/dropEventBus.ts'
import { _getAccountsForCustomer } from './_accountsStub.ts'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Opaque handle to a pre-launched Playwright browser context.
 * In v3.1 (single-node), the coordinator co-locates with the worker so this
 * is a plain object. v3.2 will replace it with a gRPC context reference.
 */
export interface BrowserContextHandle {
  /** Close the context, releasing Playwright resources. */
  close(): Promise<void>
}

export interface WarmupResult {
  dropId: string
  slug: string | null
  /** drop_run ids ready to dispatch */
  validRunIds: string[]
  /** drop_run ids skipped due to session failure */
  skippedRunIds: string[]
  /** Pre-launched contexts keyed by nikeAccountId */
  preLaunchedContexts: Map<string, BrowserContextHandle>
  /** true when SKU was already live at arm() time — phases ran in parallel */
  collapsed: boolean
}

export interface WarmupCoordinator {
  arm(dropId: string): Promise<WarmupResult>
  cancel(dropId: string): void
}

// ---------------------------------------------------------------------------
// Dependency injection (test-friendly)
// ---------------------------------------------------------------------------

export interface WarmupCoordinatorDeps {
  /**
   * Emit a single poll to check whether the SKU is already in stock.
   * Returns the slug string if found, null if not yet available.
   */
  pollOnce(sku: string, country: string): Promise<string | null>

  /**
   * Start continuous polling every `intervalMs` ms.
   * Resolves when stock is detected, or signal is aborted.
   * Returns the slug or null if aborted before detection.
   */
  pollSku(
    sku: string,
    country: string,
    opts: { intervalMs: number; signal: AbortSignal },
  ): Promise<string | null>

  /**
   * Validate the OIDC session for a given nike account.
   * Returns { valid: true } or { valid: false; reason: string }.
   */
  validateSession(
    accountId: string,
  ): Promise<{ valid: true } | { valid: false; reason: string }>

  /**
   * Pre-launch a Playwright browser context for a given account.
   * Returns the handle or throws on failure.
   */
  createContext(accountId: string): Promise<BrowserContextHandle>

  /** Sleep helper — overridden in tests to use fake timers. */
  sleep(ms: number, signal: AbortSignal): Promise<void>

  /** Returns current epoch ms — overridden in tests. */
  now(): number
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const id = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(id)
      resolve()
    }, { once: true })
  })
}

const productionDeps: WarmupCoordinatorDeps = {
  pollOnce: async (_sku, _country) => null, // TODO: wire kpsdkPoller in v3.2
  pollSku: async (_sku, _country, _opts) => null, // TODO: wire kpsdkPoller in v3.2
  validateSession: async (_accountId) => ({ valid: true }), // TODO: wire Epic 16 sessionValidator
  createContext: async (_accountId) => ({
    close: async () => { /* no-op stub */ },
  }),
  sleep: defaultSleep,
  now: Date.now,
}

// ---------------------------------------------------------------------------
// WarmupCoordinator factory
// ---------------------------------------------------------------------------

function ts(): string {
  return new Date().toISOString()
}

export function createWarmupCoordinator(
  deps: Partial<WarmupCoordinatorDeps> = {},
): WarmupCoordinator {
  const d: WarmupCoordinatorDeps = { ...productionDeps, ...deps }

  // Map of active warmup AbortControllers keyed by dropId
  const abortControllers = new Map<string, AbortController>()

  async function arm(dropId: string): Promise<WarmupResult> {
    const abort = new AbortController()
    abortControllers.set(dropId, abort)

    try {
      return await _runWarmup(dropId, abort.signal, d)
    } finally {
      abortControllers.delete(dropId)
    }
  }

  function cancel(dropId: string): void {
    const ctrl = abortControllers.get(dropId)
    if (ctrl != null) {
      ctrl.abort()
    }
  }

  // Auto-cancel when drop.cancelled is published.
  // Callers should invoke subscribeDropCancelled(dropId) after each arm()
  // to wire up per-drop auto-cancellation, or call cancel() directly.
  // (Wildcard subscription not supported in v3.1 in-memory bus.)

  return { arm, cancel }
}

// ---------------------------------------------------------------------------
// Core warmup logic (separated for testability)
// ---------------------------------------------------------------------------

async function _runWarmup(
  dropId: string,
  signal: AbortSignal,
  d: WarmupCoordinatorDeps,
): Promise<WarmupResult> {
  // Find drop across all states (already ARMED by scheduler)
  const drop = dropsDb.findByStates(['ARMED']).find((r) => r.id === dropId)
    ?? dropsDb.findByStates(['ACTIVE']).find((r) => r.id === dropId)

  if (drop == null) {
    throw new Error(`WarmupCoordinator: drop not found or not ARMED: ${dropId}`)
  }

  const fireAt = drop.scheduled_at != null ? new Date(drop.scheduled_at).getTime() : d.now()
  const msToFire = fireAt - d.now()

  const preLaunchedContexts = new Map<string, BrowserContextHandle>()
  const validRunIds: string[] = []
  const skippedRunIds: string[] = []

  // ── Phase check: is SKU already live? ─────────────────────────────────
  dropEventBus.publish(dropId, {
    event: 'warmup.polling',
    drop_id: dropId,
    timestamp: ts(),
    data: { sku: drop.sku },
  })

  const immediateSlug = await d.pollOnce(drop.sku, drop.country)

  if (immediateSlug != null || msToFire <= 0) {
    // Collapse path: stock already live — run T-3 + T-1 in parallel
    const slug = immediateSlug ?? null

    if (slug != null) {
      dropEventBus.publish(dropId, {
        event: 'warmup.slug_resolved',
        drop_id: dropId,
        timestamp: ts(),
        data: { slug },
      })
    }

    dropEventBus.publish(dropId, {
      event: 'warmup.collapsed',
      drop_id: dropId,
      timestamp: ts(),
      data: { slug: slug ?? '' },
    })

    if (signal.aborted) {
      return _cancelledResult(dropId, slug, preLaunchedContexts)
    }

    // T-3 + T-1 in parallel (collapse: no waiting between phases)
    const [sessionResult] = await Promise.all([
      _validateSessions(dropId, drop, signal, d),
    ])

    if (signal.aborted) {
      return _cancelledResult(dropId, slug, preLaunchedContexts)
    }

    const { validAccountIds, skippedAccountIds } = sessionResult

    await _launchContexts(dropId, validAccountIds, preLaunchedContexts, signal, d)

    if (signal.aborted) {
      await _closeAll(preLaunchedContexts)
      return _cancelledResult(dropId, slug, preLaunchedContexts)
    }

    await _insertRunsAndActivate(
      drop,
      validAccountIds,
      skippedAccountIds,
      validRunIds,
      skippedRunIds,
    )

    dropEventBus.publish(dropId, {
      event: 'warmup.ready',
      drop_id: dropId,
      timestamp: ts(),
      data: { valid_run_ids: validRunIds, skipped_run_ids: skippedRunIds },
    })

    return {
      dropId,
      slug,
      validRunIds,
      skippedRunIds,
      preLaunchedContexts,
      collapsed: true,
    }
  }

  // ── Normal timeline path ───────────────────────────────────────────────

  // Start background polling — will resolve slug eventually
  let resolvedSlug: string | null = null
  const pollingPromise = d.pollSku(drop.sku, drop.country, {
    intervalMs: 2_000,
    signal,
  }).then((s) => {
    resolvedSlug = s
    if (s != null) {
      dropEventBus.publish(dropId, {
        event: 'warmup.slug_resolved',
        drop_id: dropId,
        timestamp: ts(),
        data: { slug: s },
      })
    }
  })

  // T-3 (3 minutes before fire): validate sessions
  const phase2DelayMs = Math.max(0, msToFire - 3 * 60 * 1_000)
  await d.sleep(phase2DelayMs, signal)

  if (signal.aborted) {
    await _closeAll(preLaunchedContexts)
    return _cancelledResult(dropId, resolvedSlug, preLaunchedContexts)
  }

  const { validAccountIds, skippedAccountIds } = await _validateSessions(
    dropId,
    drop,
    signal,
    d,
  )

  if (signal.aborted) {
    await _closeAll(preLaunchedContexts)
    return _cancelledResult(dropId, resolvedSlug, preLaunchedContexts)
  }

  // T-1 (1 minute before fire): pre-launch contexts
  const phase3DelayMs = Math.max(
    0,
    fireAt - d.now() - 60 * 1_000,
  )
  await d.sleep(phase3DelayMs, signal)

  if (signal.aborted) {
    await _closeAll(preLaunchedContexts)
    return _cancelledResult(dropId, resolvedSlug, preLaunchedContexts)
  }

  await _launchContexts(dropId, validAccountIds, preLaunchedContexts, signal, d)

  if (signal.aborted) {
    await _closeAll(preLaunchedContexts)
    return _cancelledResult(dropId, resolvedSlug, preLaunchedContexts)
  }

  // T=0: wait for fire time, then activate
  const phase4DelayMs = Math.max(0, fireAt - d.now())
  await d.sleep(phase4DelayMs, signal)

  if (signal.aborted) {
    await _closeAll(preLaunchedContexts)
    return _cancelledResult(dropId, resolvedSlug, preLaunchedContexts)
  }

  // Let the background polling resolve if it hasn't yet (best effort)
  await Promise.race([pollingPromise, Promise.resolve(undefined)])

  await _insertRunsAndActivate(
    drop,
    validAccountIds,
    skippedAccountIds,
    validRunIds,
    skippedRunIds,
  )

  dropEventBus.publish(dropId, {
    event: 'warmup.ready',
    drop_id: dropId,
    timestamp: ts(),
    data: { valid_run_ids: validRunIds, skipped_run_ids: skippedRunIds },
  })

  return {
    dropId,
    slug: resolvedSlug,
    validRunIds,
    skippedRunIds,
    preLaunchedContexts,
    collapsed: false,
  }
}

// ---------------------------------------------------------------------------
// Phase helpers
// ---------------------------------------------------------------------------

interface SessionResult {
  validAccountIds: string[]
  skippedAccountIds: string[]
}

async function _validateSessions(
  dropId: string,
  drop: { customer_id: string },
  signal: AbortSignal,
  d: WarmupCoordinatorDeps,
): Promise<SessionResult> {
  // Resolve accounts for this drop (in-memory stub — real Epic 16 vault in v3.2)
  const accounts = _getAccountsForCustomer(drop.customer_id)

  const validAccountIds: string[] = []
  const skippedAccountIds: string[] = []

  // Emit per-account validating events, then validate in parallel
  for (const acc of accounts) {
    dropEventBus.publish(dropId, {
      event: 'warmup.account_validating',
      drop_id: dropId,
      account_id: acc.id,
      timestamp: ts(),
      data: {},
    })
  }

  const results = await Promise.all(
    accounts.map(async (acc) => {
      if (signal.aborted) return { id: acc.id, valid: false as const, reason: 'cancelled' }
      const r = await d.validateSession(acc.id)
      return { id: acc.id, ...r }
    }),
  )

  for (const r of results) {
    if (r.valid) {
      validAccountIds.push(r.id)
      dropEventBus.publish(dropId, {
        event: 'warmup.account_validated',
        drop_id: dropId,
        account_id: r.id,
        timestamp: ts(),
        data: {},
      })
    } else {
      skippedAccountIds.push(r.id)
      dropEventBus.publish(dropId, {
        event: 'warmup.session_failed',
        drop_id: dropId,
        account_id: r.id,
        timestamp: ts(),
        data: { reason: r.reason },
      })
    }
  }

  dropEventBus.publish(dropId, {
    event: 'warmup.sessions_validated',
    drop_id: dropId,
    timestamp: ts(),
    data: { valid: validAccountIds.length, total: results.length },
  })

  return { validAccountIds, skippedAccountIds }
}

async function _launchContexts(
  dropId: string,
  accountIds: string[],
  preLaunchedContexts: Map<string, BrowserContextHandle>,
  signal: AbortSignal,
  d: WarmupCoordinatorDeps,
): Promise<void> {
  for (const accountId of accountIds) {
    if (signal.aborted) break

    dropEventBus.publish(dropId, {
      event: 'warmup.account_launching',
      drop_id: dropId,
      account_id: accountId,
      timestamp: ts(),
      data: {},
    })

    try {
      const ctx = await d.createContext(accountId)
      preLaunchedContexts.set(accountId, ctx)
      dropEventBus.publish(dropId, {
        event: 'warmup.account_ready',
        drop_id: dropId,
        account_id: accountId,
        timestamp: ts(),
        data: {},
      })
    } catch (err) {
      dropEventBus.publish(dropId, {
        event: 'warmup.account_launch_failed',
        drop_id: dropId,
        account_id: accountId,
        timestamp: ts(),
        data: { reason: String(err) },
      })
    }
  }

  dropEventBus.publish(dropId, {
    event: 'warmup.contexts_launched',
    drop_id: dropId,
    timestamp: ts(),
    data: { count: preLaunchedContexts.size },
  })
}

async function _insertRunsAndActivate(
  drop: { id: string; customer_id: string },
  validAccountIds: string[],
  skippedAccountIds: string[],
  validRunIds: string[],
  skippedRunIds: string[],
): Promise<void> {
  // Insert WAITING drop_run rows for valid accounts
  for (const accountId of validAccountIds) {
    const run = await dropRunRepository.insertWaiting({
      dropId: drop.id,
      nikeAccountId: accountId,
      customerId: drop.customer_id,
      attempt: 1,
    })
    validRunIds.push(run.id)
  }

  // Insert SKIPPED runs for invalid accounts
  for (const accountId of skippedAccountIds) {
    const run = await dropRunRepository.insertWaiting({
      dropId: drop.id,
      nikeAccountId: accountId,
      customerId: drop.customer_id,
      attempt: 1,
    })
    // Finalize as SKIPPED immediately
    dropRunRepository.finalize(run.id, 'SKIPPED', { skipReason: 'session_failed' })
    skippedRunIds.push(run.id)
  }

  // Transition ARMED → ACTIVE
  try {
    transitionState(drop.id, 'ACTIVE', 'warmup', drop.customer_id)
  } catch {
    // Already transitioned — skip
  }
}

async function _closeAll(
  contexts: Map<string, BrowserContextHandle>,
): Promise<void> {
  await Promise.all([...contexts.values()].map((c) => c.close().catch(() => { /* ignore */ })))
  contexts.clear()
}

function _cancelledResult(
  dropId: string,
  slug: string | null,
  preLaunchedContexts: Map<string, BrowserContextHandle>,
): WarmupResult {
  dropEventBus.publish(dropId, {
    event: 'warmup.cancelled',
    drop_id: dropId,
    timestamp: ts(),
    data: {},
  })
  return {
    dropId,
    slug,
    validRunIds: [],
    skippedRunIds: [],
    preLaunchedContexts,
    collapsed: false,
  }
}
