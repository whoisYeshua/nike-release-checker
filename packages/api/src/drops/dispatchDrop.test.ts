// dispatchDrop tests — Story 17.3

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { dropsDb } from '../db/drops.ts'
import { _resetAuditLog } from './dropRepository.ts'
import { dropRunRepository, _resetDropRunStore } from './dropRunRepository.ts'
import {
  dispatchDrop,
  checkDropCompletion,
  _seedNikeAccount,
  _resetNikeAccounts,
} from './dispatchDrop.ts'

const CUSTOMER = 'cust_dispatch_001'

function seedDrop(accountsFilter?: unknown) {
  const drop = dropsDb.create({
    customerId: CUSTOMER,
    country: 'US',
    sku: 'AB1234-001',
    sizes: ['10'],
    maxAccounts: 10,
    paymentMethodId: 'pm_test',
  })
  // Inject accounts_filter into the raw row for tests
  if (accountsFilter !== undefined) {
    ;(drop as unknown as Record<string, unknown>)['accounts_filter'] = accountsFilter
  }
  // Manually patch the store by re-fetching — the in-memory store holds a
  // reference, so mutation is visible.
  return drop
}

function seedAccount(id: string, sessionState: 'valid' | 'expired' | 'banned' = 'valid') {
  _seedNikeAccount({ id, customer_id: CUSTOMER, session_state: sessionState })
}

beforeEach(() => {
  dropsDb._reset()
  _resetAuditLog()
  _resetDropRunStore()
  _resetNikeAccounts()
})

// ---------------------------------------------------------------------------
// dispatchDrop — accounts_filter = 'all'
// ---------------------------------------------------------------------------

describe('dispatchDrop — accounts_filter all', () => {
  it('inserts WAITING rows for all valid accounts (5 accounts)', async () => {
    for (let i = 1; i <= 5; i++) seedAccount(`acc_00${i}`)
    // Drop without filter → defaults to 'all'
    const drop = seedDrop()
    // Promote to ACTIVE via dropsDb so dispatchDrop can find it
    dropsDb.updateState(drop.id, CUSTOMER, ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(drop.id, CUSTOMER, ['SCHEDULED'], 'ARMED')
    dropsDb.updateState(drop.id, CUSTOMER, ['ARMED'], 'ACTIVE')

    await dispatchDrop(drop.id)

    const runs = await dropRunRepository.listByDrop(drop.id)
    assert.equal(runs.length, 5)
    assert.ok(runs.every((r) => r.state === 'WAITING'))
    assert.ok(runs.every((r) => r.attempt === 1))
    assert.ok(runs.every((r) => r.customer_id === CUSTOMER))
  })

  it('excludes expired/banned accounts', async () => {
    seedAccount('acc_valid_1')
    seedAccount('acc_valid_2')
    seedAccount('acc_expired_1', 'expired')
    seedAccount('acc_banned_1', 'banned')

    const drop = seedDrop()
    dropsDb.updateState(drop.id, CUSTOMER, ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(drop.id, CUSTOMER, ['SCHEDULED'], 'ARMED')
    dropsDb.updateState(drop.id, CUSTOMER, ['ARMED'], 'ACTIVE')

    await dispatchDrop(drop.id)

    const runs = await dropRunRepository.listByDrop(drop.id)
    assert.equal(runs.length, 2)
  })
})

// ---------------------------------------------------------------------------
// dispatchDrop — accounts_filter = explicit list
// ---------------------------------------------------------------------------

describe('dispatchDrop — accounts_filter list', () => {
  it('inserts exactly 2 rows when filter lists [acc_1, acc_2]', async () => {
    for (let i = 1; i <= 5; i++) seedAccount(`acc_00${i}`)

    const drop = seedDrop({ type: 'list', ids: ['acc_001', 'acc_002'] })
    dropsDb.updateState(drop.id, CUSTOMER, ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(drop.id, CUSTOMER, ['SCHEDULED'], 'ARMED')
    dropsDb.updateState(drop.id, CUSTOMER, ['ARMED'], 'ACTIVE')

    await dispatchDrop(drop.id)

    const runs = await dropRunRepository.listByDrop(drop.id)
    assert.equal(runs.length, 2)

    const accountIds = runs.map((r) => r.nike_account_id)
    assert.ok(accountIds.includes('acc_001'))
    assert.ok(accountIds.includes('acc_002'))
  })

  it('dispatches 0 rows when listed accounts are all invalid', async () => {
    seedAccount('acc_001', 'expired')
    seedAccount('acc_002', 'banned')

    const drop = seedDrop({ type: 'list', ids: ['acc_001', 'acc_002'] })
    dropsDb.updateState(drop.id, CUSTOMER, ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(drop.id, CUSTOMER, ['SCHEDULED'], 'ARMED')
    dropsDb.updateState(drop.id, CUSTOMER, ['ARMED'], 'ACTIVE')

    await dispatchDrop(drop.id)

    const runs = await dropRunRepository.listByDrop(drop.id)
    assert.equal(runs.length, 0)
  })
})

// ---------------------------------------------------------------------------
// checkDropCompletion
// ---------------------------------------------------------------------------

describe('checkDropCompletion', () => {
  it('returns false while runs are not all terminal', async () => {
    seedAccount('acc_001')
    const drop = seedDrop()
    dropsDb.updateState(drop.id, CUSTOMER, ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(drop.id, CUSTOMER, ['SCHEDULED'], 'ARMED')
    dropsDb.updateState(drop.id, CUSTOMER, ['ARMED'], 'ACTIVE')

    await dispatchDrop(drop.id)

    // Run still WAITING — not terminal
    const done = await checkDropCompletion(drop.id, CUSTOMER, 'w1')
    assert.equal(done, false)
  })

  it('transitions drop to COMPLETED when all runs are terminal', async () => {
    seedAccount('acc_001')
    const drop = seedDrop()
    dropsDb.updateState(drop.id, CUSTOMER, ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(drop.id, CUSTOMER, ['SCHEDULED'], 'ARMED')
    dropsDb.updateState(drop.id, CUSTOMER, ['ARMED'], 'ACTIVE')

    await dispatchDrop(drop.id)

    const run = await dropRunRepository.leaseNext('w1')
    assert.ok(run != null)
    await dropRunRepository.finalize(run.id, 'COP', { orderNumber: 'ORD-1' })

    const done = await checkDropCompletion(drop.id, CUSTOMER, 'w1')
    assert.equal(done, true)

    const stored = dropsDb.findById(drop.id, CUSTOMER)
    assert.equal(stored?.state, 'COMPLETED')
  })
})
