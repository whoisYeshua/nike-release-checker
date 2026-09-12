// dropScheduler.test.ts — Story 17.2
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createDropScheduler, _resetSchedulerMetrics } from './dropScheduler.ts'
import { dropsDb } from '../db/drops.ts'
import { _resetAuditLog } from '../drops/dropRepository.ts'
import { _seedCustomerTier, _clearCustomerTier } from '../services/customerTier.ts'
import type { WorkerPoolClient } from './workerPoolClient.ts'

function makeWorkerPool(): { client: WorkerPoolClient; dispatched: string[] } {
  const dispatched: string[] = []
  const client: WorkerPoolClient = {
    async dispatchDrop(dropId: string): Promise<void> {
      dispatched.push(dropId)
    },
  }
  return { client, dispatched }
}

function pastIso(offsetMs = 10_000): string {
  return new Date(Date.now() - offsetMs).toISOString()
}

function futureIso(offsetMs = 60_000): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

beforeEach(() => {
  dropsDb._reset()
  _resetAuditLog()
  _clearCustomerTier()
  _resetSchedulerMetrics()
})

/**
 * Helper: create a drop and move it to SCHEDULED state.
 */
function seedScheduledDrop(
  customerId: string,
  scheduledAt: string,
): ReturnType<typeof dropsDb.create> {
  const drop = dropsDb.create({
    customerId,
    country: 'US',
    sku: 'SKU-TEST',
    sizes: ['10'],
    maxAccounts: 1,
    paymentMethodId: 'pm_test',
    scheduledAt,
  })
  dropsDb.updateState(drop.id, customerId, ['DRAFT'], 'SCHEDULED')
  return drop
}

describe('dropScheduler — tick promotion', () => {
  it('3 SCHEDULED drops in the past → all reach ACTIVE after a single tick', async () => {
    _seedCustomerTier('cust-a', 'enterprise')

    const d1 = seedScheduledDrop('cust-a', pastIso(10_000))
    const d2 = seedScheduledDrop('cust-a', pastIso(20_000))
    const d3 = seedScheduledDrop('cust-a', pastIso(30_000))

    const { client, dispatched } = makeWorkerPool()
    const scheduler = createDropScheduler({ workerPool: client, intervalMs: 60_000 })
    await scheduler.start()

    // Manually call the scheduler internal by starting and then calling tick via a
    // short-lived scheduler with intervalMs=0 trick — instead we invoke tick directly
    // by stopping immediately and running a single-tick via a 1ms interval.
    await scheduler.stop()

    // Run a direct tick by creating a scheduler with interval 0 and running start/stop cycle
    let tickRan = false
    const singleTick = createDropScheduler({
      workerPool: client,
      intervalMs: 1,
      acquireLock: async () => {
        if (!tickRan) {
          tickRan = true
          return true
        }
        return false
      },
    })

    await singleTick.start()
    // Wait for the tick to execute
    await new Promise((resolve) => setTimeout(resolve, 20))
    await singleTick.stop()

    const row1 = dropsDb.findById(d1.id, 'cust-a')
    const row2 = dropsDb.findById(d2.id, 'cust-a')
    const row3 = dropsDb.findById(d3.id, 'cust-a')

    // After one tick: SCHEDULED → ARMED (T-5 window), ARMED → ACTIVE (T-0)
    // Since all scheduled_at are in the past, they qualify for both promotions.
    // But a single tick does one pass: first arms all, then activates all.
    assert.equal(row1?.state, 'ACTIVE', 'drop 1 should be ACTIVE')
    assert.equal(row2?.state, 'ACTIVE', 'drop 2 should be ACTIVE')
    assert.equal(row3?.state, 'ACTIVE', 'drop 3 should be ACTIVE')
    assert.equal(dispatched.length, 3, '3 drops should be dispatched')
  })

  it('Solo customer with 2 concurrent ARMED drops → only 1 reaches ACTIVE per tick', async () => {
    _seedCustomerTier('cust-solo', 'solo')

    // Pre-seed 2 armed drops (bypass scheduler to have them ready for T-0 activation)
    const d1 = dropsDb.create({
      customerId: 'cust-solo',
      country: 'US',
      sku: 'SKU-A',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
      scheduledAt: pastIso(5_000),
    })
    dropsDb.updateState(d1.id, 'cust-solo', ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(d1.id, 'cust-solo', ['SCHEDULED'], 'ARMED')

    const d2 = dropsDb.create({
      customerId: 'cust-solo',
      country: 'US',
      sku: 'SKU-B',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
      scheduledAt: pastIso(5_000),
    })
    dropsDb.updateState(d2.id, 'cust-solo', ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(d2.id, 'cust-solo', ['SCHEDULED'], 'ARMED')

    const { client, dispatched } = makeWorkerPool()

    let tickRan = false
    const scheduler = createDropScheduler({
      workerPool: client,
      intervalMs: 1,
      acquireLock: async () => {
        if (!tickRan) {
          tickRan = true
          return true
        }
        return false
      },
    })

    await scheduler.start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await scheduler.stop()

    const row1 = dropsDb.findById(d1.id, 'cust-solo')
    const row2 = dropsDb.findById(d2.id, 'cust-solo')

    const activeStates = [row1?.state, row2?.state].filter((s) => s === 'ACTIVE')
    const armedStates = [row1?.state, row2?.state].filter((s) => s === 'ARMED')

    assert.equal(activeStates.length, 1, 'exactly 1 drop should be ACTIVE')
    assert.equal(armedStates.length, 1, 'exactly 1 drop should stay ARMED')
    assert.equal(dispatched.length, 1, 'exactly 1 drop dispatched')
  })

  it('Non-leader instances skip the tick (leader election)', async () => {
    _seedCustomerTier('cust-b', 'enterprise')
    const d1 = seedScheduledDrop('cust-b', pastIso(5_000))
    dropsDb.updateState(d1.id, 'cust-b', ['SCHEDULED'], 'ARMED')

    const { client, dispatched } = makeWorkerPool()

    // This scheduler never acquires the lock (non-leader)
    const nonLeader = createDropScheduler({
      workerPool: client,
      intervalMs: 1,
      acquireLock: async () => false, // never leader
    })

    await nonLeader.start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await nonLeader.stop()

    const row = dropsDb.findById(d1.id, 'cust-b')
    assert.equal(row?.state, 'ARMED', 'non-leader should not promote drop')
    assert.equal(dispatched.length, 0, 'non-leader should not dispatch')
  })

  it('SCHEDULED drops in the far future stay SCHEDULED', async () => {
    _seedCustomerTier('cust-c', 'enterprise')
    const d1 = seedScheduledDrop('cust-c', futureIso(60 * 60 * 1_000)) // 1 hour away

    const { client } = makeWorkerPool()

    let tickRan = false
    const scheduler = createDropScheduler({
      workerPool: client,
      intervalMs: 1,
      acquireLock: async () => {
        if (!tickRan) {
          tickRan = true
          return true
        }
        return false
      },
    })

    await scheduler.start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await scheduler.stop()

    const row = dropsDb.findById(d1.id, 'cust-c')
    assert.equal(row?.state, 'SCHEDULED', 'far-future drop should remain SCHEDULED')
  })
})
