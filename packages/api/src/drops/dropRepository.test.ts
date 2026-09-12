import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { dropsDb } from '../db/drops.ts'
import { InvalidDropTransitionError } from './dropStateMachine.ts'
import { _resetAuditLog, getAuditLog, transitionState } from './dropRepository.ts'

const CUSTOMER = 'cust_test_001'

function seedDrop() {
  return dropsDb.create({
    customerId: CUSTOMER,
    country: 'US',
    sku: 'AB1234-001',
    sizes: ['10', '11'],
    maxAccounts: 3,
    paymentMethodId: 'pm_test',
  })
}

beforeEach(() => {
  dropsDb._reset()
  _resetAuditLog()
})

// ---------------------------------------------------------------------------
// Happy path — valid transition with audit row
// ---------------------------------------------------------------------------

describe('transitionState — valid transitions', () => {
  it('DRAFT → SCHEDULED updates state and writes audit row', () => {
    const drop = seedDrop()
    const updated = transitionState(drop.id, 'SCHEDULED', 'customer:cust_test_001', CUSTOMER, 'fire_at set')

    assert.equal(updated.state, 'SCHEDULED')

    // Verify in-store
    const stored = dropsDb.findById(drop.id, CUSTOMER)
    assert.equal(stored?.state, 'SCHEDULED')

    // Audit row written
    const audit = getAuditLog(drop.id)
    assert.equal(audit.length, 1)
    assert.equal(audit[0]!.from_state, 'DRAFT')
    assert.equal(audit[0]!.to_state, 'SCHEDULED')
    assert.equal(audit[0]!.actor, 'customer:cust_test_001')
    assert.equal(audit[0]!.reason, 'fire_at set')
    assert.ok(audit[0]!.occurred_at.length > 0)
  })

  it('DRAFT → SCHEDULED → ARMED writes two audit rows', () => {
    const drop = seedDrop()
    transitionState(drop.id, 'SCHEDULED', 'customer:cust_test_001', CUSTOMER)
    transitionState(drop.id, 'ARMED', 'scheduler:tick', CUSTOMER)

    const audit = getAuditLog(drop.id)
    assert.equal(audit.length, 2)
    assert.equal(audit[0]!.from_state, 'DRAFT')
    assert.equal(audit[0]!.to_state, 'SCHEDULED')
    assert.equal(audit[1]!.from_state, 'SCHEDULED')
    assert.equal(audit[1]!.to_state, 'ARMED')
    assert.equal(audit[1]!.actor, 'scheduler:tick')
  })

  it('full happy path: DRAFT → SCHEDULED → ARMED → ACTIVE → COMPLETED → ARCHIVED', () => {
    const drop = seedDrop()
    transitionState(drop.id, 'SCHEDULED', 'customer:cust_test_001', CUSTOMER)
    transitionState(drop.id, 'ARMED', 'scheduler:tick', CUSTOMER)
    transitionState(drop.id, 'ACTIVE', 'scheduler:fire', CUSTOMER)
    transitionState(drop.id, 'COMPLETED', 'worker:w1', CUSTOMER)
    transitionState(drop.id, 'ARCHIVED', 'system:cleanup', CUSTOMER)

    const stored = dropsDb.findById(drop.id, CUSTOMER)
    assert.equal(stored?.state, 'ARCHIVED')

    const audit = getAuditLog(drop.id)
    assert.equal(audit.length, 5)
  })

  it('DRAFT → CANCELLED', () => {
    const drop = seedDrop()
    const updated = transitionState(drop.id, 'CANCELLED', 'customer:cust_test_001', CUSTOMER, 'user aborted')
    assert.equal(updated.state, 'CANCELLED')

    const audit = getAuditLog(drop.id)
    assert.equal(audit.length, 1)
    assert.equal(audit[0]!.to_state, 'CANCELLED')
    assert.equal(audit[0]!.reason, 'user aborted')
  })
})

// ---------------------------------------------------------------------------
// Invalid transitions — no DB changes
// ---------------------------------------------------------------------------

describe('transitionState — invalid transitions', () => {
  it('DRAFT → ACTIVE throws InvalidDropTransitionError and does not mutate DB', () => {
    const drop = seedDrop()

    assert.throws(
      () => transitionState(drop.id, 'ACTIVE', 'system', CUSTOMER),
      InvalidDropTransitionError,
    )

    // State unchanged
    const stored = dropsDb.findById(drop.id, CUSTOMER)
    assert.equal(stored?.state, 'DRAFT')

    // No audit row written
    assert.equal(getAuditLog(drop.id).length, 0)
  })

  it('DRAFT → COMPLETED throws and leaves no audit', () => {
    const drop = seedDrop()
    assert.throws(() => transitionState(drop.id, 'COMPLETED', 'system', CUSTOMER), InvalidDropTransitionError)
    assert.equal(getAuditLog(drop.id).length, 0)
  })

  it('COMPLETED → DRAFT throws (backwards)', () => {
    const drop = seedDrop()
    // Walk to COMPLETED first
    transitionState(drop.id, 'SCHEDULED', 'customer:x', CUSTOMER)
    transitionState(drop.id, 'ARMED', 'scheduler:tick', CUSTOMER)
    transitionState(drop.id, 'ACTIVE', 'scheduler:fire', CUSTOMER)
    transitionState(drop.id, 'COMPLETED', 'worker:w1', CUSTOMER)

    assert.throws(() => transitionState(drop.id, 'DRAFT', 'system', CUSTOMER), InvalidDropTransitionError)

    // Still COMPLETED
    const stored = dropsDb.findById(drop.id, CUSTOMER)
    assert.equal(stored?.state, 'COMPLETED')
  })

  it('ARCHIVED → any state throws (terminal)', () => {
    const drop = seedDrop()
    transitionState(drop.id, 'ARCHIVED', 'system:cleanup', CUSTOMER)

    for (const s of ['DRAFT', 'SCHEDULED', 'ARMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] as const) {
      assert.throws(() => transitionState(drop.id, s, 'system', CUSTOMER), InvalidDropTransitionError)
    }
  })
})

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

describe('transitionState — drop not found', () => {
  it('throws when drop does not exist', () => {
    assert.throws(
      () => transitionState('drp_nonexistent', 'SCHEDULED', 'customer:x', CUSTOMER),
      /Drop not found/,
    )
  })

  it('throws when drop exists but belongs to different customer', () => {
    const drop = seedDrop()
    assert.throws(
      () => transitionState(drop.id, 'SCHEDULED', 'customer:other', 'cust_other'),
      /Drop not found/,
    )
  })
})

// ---------------------------------------------------------------------------
// Audit log isolation between drops
// ---------------------------------------------------------------------------

describe('audit log isolation', () => {
  it('audit rows are scoped to drop_id', () => {
    const d1 = seedDrop()
    const d2 = seedDrop()

    transitionState(d1.id, 'SCHEDULED', 'customer:x', CUSTOMER)
    transitionState(d2.id, 'CANCELLED', 'customer:x', CUSTOMER)

    assert.equal(getAuditLog(d1.id).length, 1)
    assert.equal(getAuditLog(d2.id).length, 1)
    assert.equal(getAuditLog(d1.id)[0]!.to_state, 'SCHEDULED')
    assert.equal(getAuditLog(d2.id)[0]!.to_state, 'CANCELLED')
  })
})
