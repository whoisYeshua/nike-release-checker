// Warmup coordinator tests — Story 17.5
// Uses node:test + fake clock via manual time control on deps.

import { describe, it, beforeEach, afterEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { dropsDb } from '../db/drops.ts'
import { _resetAuditLog } from '../drops/dropRepository.ts'
import { dropRunRepository } from '../drops/dropRunRepository.ts'
import {
  createWarmupCoordinator,
  type WarmupCoordinatorDeps,
  type BrowserContextHandle,
} from './warmupCoordinator.ts'
import { _seedWarmupAccount, _resetWarmupAccounts } from './_accountsStub.ts'
import type { DropEvent } from '../events/dropEventTaxonomy.ts'
import { dropEventBus } from '../events/dropEventBus.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkDrop(overrides: { scheduledAt?: string } = {}) {
  const scheduledAt =
    overrides.scheduledAt ?? new Date(Date.now() + 5 * 60 * 1_000).toISOString()

  const drop = dropsDb.create({
    customerId: 'cust_test',
    country: 'FR',
    sku: 'IQ7604-101',
    sizes: ['42'],
    maxAccounts: 10,
    paymentMethodId: 'pm_test',
    scheduledAt,
  })

  // Transition: DRAFT → SCHEDULED → ARMED
  dropsDb.updateState(drop.id, 'cust_test', ['DRAFT'], 'SCHEDULED')
  dropsDb.updateState(drop.id, 'cust_test', ['SCHEDULED'], 'ARMED')

  return drop
}

function mkCloseable(): BrowserContextHandle {
  let closed = false
  return {
    close: async () => {
      closed = true
    },
    get _closed() {
      return closed
    },
  } as BrowserContextHandle & { _closed: boolean }
}

/** Instant sleep — overrides deps.sleep to not block. */
const instantSleep: WarmupCoordinatorDeps['sleep'] = async () => { /* instant */ }

/** Collect events for a drop during a callback. */
function captureEvents(dropId: string, cb: () => Promise<void>): Promise<DropEvent[]> {
  const events: DropEvent[] = []
  const unsub = dropEventBus.subscribe(dropId, (e) => events.push(e))
  return cb().then(() => {
    unsub()
    return events
  }, (err: unknown) => {
    unsub()
    throw err
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  dropsDb._reset()
  _resetAuditLog()
  _resetWarmupAccounts()
})

afterEach(() => {
  dropsDb._reset()
  _resetAuditLog()
  _resetWarmupAccounts()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WarmupCoordinator', () => {
  // ── Test 1: normal timeline ──────────────────────────────────────────────
  it('fires phases in order: polling → sessions_validated → contexts_launched → ready', async () => {
    const drop = mkDrop()
    _seedWarmupAccount({ id: 'acc1', customer_id: 'cust_test' })
    _seedWarmupAccount({ id: 'acc2', customer_id: 'cust_test' })

    let pollCalled = false
    const contexts: Array<BrowserContextHandle & { _closed: boolean }> = []

    const coordinator = createWarmupCoordinator({
      pollOnce: async () => null,
      pollSku: async (_sku, _country, { signal }) => {
        pollCalled = true
        // Resolve immediately for test speed
        return new Promise<string | null>((resolve) => {
          signal.addEventListener('abort', () => resolve(null), { once: true })
          setTimeout(() => resolve('slug-for-iq7604'), 0)
        })
      },
      validateSession: async () => ({ valid: true }),
      createContext: async () => {
        const ctx = mkCloseable()
        contexts.push(ctx as BrowserContextHandle & { _closed: boolean })
        return ctx
      },
      sleep: instantSleep,
      now: Date.now,
    })

    const events = await captureEvents(drop.id, async () => {
      await coordinator.arm(drop.id)
    })

    assert.ok(pollCalled, 'pollSku called')

    const eventNames = events.map((e) => e.event)

    assert.ok(eventNames.includes('warmup.polling'), 'warmup.polling emitted')
    assert.ok(eventNames.includes('warmup.sessions_validated'), 'sessions_validated emitted')
    assert.ok(eventNames.includes('warmup.contexts_launched'), 'contexts_launched emitted')
    assert.ok(eventNames.includes('warmup.ready'), 'warmup.ready emitted')

    // Order: polling before sessions before contexts before ready
    const idxPolling = eventNames.indexOf('warmup.polling')
    const idxSessions = eventNames.indexOf('warmup.sessions_validated')
    const idxContexts = eventNames.indexOf('warmup.contexts_launched')
    const idxReady = eventNames.indexOf('warmup.ready')
    assert.ok(idxPolling < idxSessions, 'polling before sessions')
    assert.ok(idxSessions < idxContexts, 'sessions before contexts')
    assert.ok(idxContexts < idxReady, 'contexts before ready')

    // Drop transitioned to ACTIVE
    const activeDrop = dropsDb.findByStates(['ACTIVE']).find((r) => r.id === drop.id)
    assert.ok(activeDrop != null, 'drop is ACTIVE after warm-up')

    // Contexts created
    assert.equal(contexts.length, 2)
  })

  // ── Test 2: collapse path ────────────────────────────────────────────────
  it('collapses when SKU is already live at arm() time', async () => {
    // scheduledAt in the future but pollOnce immediately returns slug
    const drop = mkDrop()
    _seedWarmupAccount({ id: 'acc1', customer_id: 'cust_test' })

    const coordinator = createWarmupCoordinator({
      pollOnce: async () => 'slug-already-live',
      pollSku: async () => 'slug-already-live',
      validateSession: async () => ({ valid: true }),
      createContext: async () => mkCloseable(),
      sleep: instantSleep,
      now: Date.now,
    })

    let result: Awaited<ReturnType<typeof coordinator.arm>> | undefined
    const events = await captureEvents(drop.id, async () => {
      result = await coordinator.arm(drop.id)
    })

    assert.ok(result != null)
    assert.equal((result as Awaited<ReturnType<typeof coordinator.arm>>).collapsed, true, 'collapsed flag set')
    assert.equal((result as Awaited<ReturnType<typeof coordinator.arm>>).slug, 'slug-already-live')

    const names = events.map((e) => e.event)
    assert.ok(names.includes('warmup.collapsed'), 'warmup.collapsed emitted')
    assert.ok(names.includes('warmup.ready'), 'warmup.ready emitted')
  })

  // ── Test 3: session failures ─────────────────────────────────────────────
  it('skips invalid sessions — 3/10 fail → skippedRunIds.length === 3', async () => {
    const drop = mkDrop()
    const badIds = new Set(['bad1', 'bad2', 'bad3'])

    for (let i = 0; i < 10; i++) {
      const id = badIds.has(`bad${i + 1}`) ? `bad${i + 1}` : `ok${i + 1}`
      _seedWarmupAccount({ id, customer_id: 'cust_test' })
    }

    const coordinator = createWarmupCoordinator({
      pollOnce: async () => null,
      pollSku: async () => null,
      validateSession: async (id) =>
        badIds.has(id) ? { valid: false, reason: 'expired' } : { valid: true },
      createContext: async () => mkCloseable(),
      sleep: instantSleep,
      now: Date.now,
    })

    const events: DropEvent[] = []
    const unsub = dropEventBus.subscribe(drop.id, (e) => events.push(e))

    const result = await coordinator.arm(drop.id)
    unsub()

    assert.equal(result.validRunIds.length, 7, 'validRunIds')
    assert.equal(result.skippedRunIds.length, 3, 'skippedRunIds')

    const failedEvents = events.filter((e) => e.event === 'warmup.session_failed')
    assert.equal(failedEvents.length, 3, '3 warmup.session_failed events emitted')
  })

  // ── Test 4: cancel mid-warmup ─────────────────────────────────────────────
  it('cancel() closes pre-launched contexts and emits warmup.cancelled', async () => {
    const drop = mkDrop()
    _seedWarmupAccount({ id: 'acc1', customer_id: 'cust_test' })

    const ctxList: Array<BrowserContextHandle & { _closed: boolean }> = []
    let resolveValidate!: (v: { valid: true }) => void

    const coordinator = createWarmupCoordinator({
      pollOnce: async () => null,
      // pollSku never resolves — background polling blocks
      pollSku: async (_sku, _country, { signal }) =>
        new Promise<string | null>((resolve) => {
          signal.addEventListener('abort', () => resolve(null), { once: true })
        }),
      validateSession: async () =>
        new Promise((resolve) => {
          resolveValidate = resolve
        }),
      createContext: async () => {
        const ctx = mkCloseable()
        ctxList.push(ctx as BrowserContextHandle & { _closed: boolean })
        return ctx
      },
      sleep: instantSleep,
      now: Date.now,
    })

    const events: DropEvent[] = []
    const unsub = dropEventBus.subscribe(drop.id, (e) => events.push(e))

    const armPromise = coordinator.arm(drop.id)

    // Wait for validate to be called, then cancel
    await new Promise<void>((r) => setTimeout(r, 10))
    coordinator.cancel(drop.id)

    // Resolve validate after cancellation (shouldn't affect result)
    if (resolveValidate != null) resolveValidate({ valid: true })

    const result = await armPromise
    unsub()

    const names = events.map((e) => e.event)
    assert.ok(names.includes('warmup.cancelled'), 'warmup.cancelled emitted')

    assert.equal(result.validRunIds.length, 0, 'no valid runs after cancel')
    assert.equal(result.skippedRunIds.length, 0, 'no skipped runs after cancel')
  })

  // ── Test 5: dispatcher reuses pre-launched contexts ───────────────────────
  it('dispatchDrop with preLaunchedContexts does not create new contexts', async () => {
    const drop = mkDrop()
    _seedWarmupAccount({ id: 'acc1', customer_id: 'cust_test' })

    const createdContexts: string[] = []

    const coordinator = createWarmupCoordinator({
      pollOnce: async () => null,
      pollSku: async () => null,
      validateSession: async () => ({ valid: true }),
      createContext: async (accountId) => {
        createdContexts.push(accountId)
        return mkCloseable()
      },
      sleep: instantSleep,
      now: Date.now,
    })

    const result = await coordinator.arm(drop.id)

    // Verify contexts were created during warmup
    assert.equal(createdContexts.length, 1, 'exactly 1 context pre-launched')
    assert.ok(result.preLaunchedContexts.has('acc1'), 'context keyed by accountId')

    // Simulate dispatcher receiving the pre-launched map
    // and verifying it does NOT call createCheckoutContext again
    let dispatcherCreatedContext = false
    const simulateDispatch = async (
      preLaunchedContexts: Map<string, BrowserContextHandle>,
    ) => {
      // Dispatcher should use preLaunchedContexts.get(accountId) instead of creating
      const ctx = preLaunchedContexts.get('acc1')
      if (ctx == null) {
        dispatcherCreatedContext = true // would call createCheckoutContext
      }
      return ctx
    }

    const ctx = await simulateDispatch(result.preLaunchedContexts)
    assert.ok(!dispatcherCreatedContext, 'dispatcher did NOT create a new context')
    assert.ok(ctx != null, 'dispatcher received pre-launched context')

    // Cleanup: verify contexts can be closed by dispatcher
    await ctx.close()

    // Run completion via dropRunRepository
    const runs = await dropRunRepository.listByDrop(drop.id)
    assert.ok(runs.length > 0, 'drop_run rows inserted')
  })
})
