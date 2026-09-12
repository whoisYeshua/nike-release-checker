// Drop run repository tests — Story 17.3
// AC coverage: lease isolation, retry chain, stale-lease reap

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import {
  dropRunRepository,
  _resetDropRunStore,
} from './dropRunRepository.ts'

const DROP_ID = 'drp_test_0001'
const ACCOUNT_ID = 'acc_test_0001'
const CUSTOMER_ID = 'cust_test_0001'

function seedWaiting(overrides?: { attempt?: number; accountId?: string }) {
  return dropRunRepository.insertWaiting({
    dropId: DROP_ID,
    nikeAccountId: overrides?.accountId ?? ACCOUNT_ID,
    customerId: CUSTOMER_ID,
    attempt: overrides?.attempt ?? 1,
  })
}

beforeEach(() => {
  _resetDropRunStore()
})

// ---------------------------------------------------------------------------
// insertWaiting
// ---------------------------------------------------------------------------

describe('insertWaiting', () => {
  it('inserts a WAITING run with attempt=1', async () => {
    const run = await seedWaiting()
    assert.equal(run.state, 'WAITING')
    assert.equal(run.attempt, 1)
    assert.equal(run.drop_id, DROP_ID)
    assert.equal(run.nike_account_id, ACCOUNT_ID)
  })

  it('is idempotent on duplicate (drop_id, nike_account_id, attempt)', async () => {
    const r1 = await seedWaiting()
    const r2 = await seedWaiting() // same params
    assert.equal(r1.id, r2.id)

    const runs = await dropRunRepository.listByDrop(DROP_ID)
    assert.equal(runs.length, 1)
  })
})

// ---------------------------------------------------------------------------
// leaseNext — SKIP LOCKED isolation
// ---------------------------------------------------------------------------

describe('leaseNext', () => {
  it('returns null when no WAITING runs exist', async () => {
    const result = await dropRunRepository.leaseNext('worker_1')
    assert.equal(result, null)
  })

  it('transitions the run to COPPING and sets worker_id', async () => {
    const inserted = await seedWaiting()
    const leased = await dropRunRepository.leaseNext('worker_1')

    assert.ok(leased != null)
    assert.equal(leased.id, inserted.id)
    assert.equal(leased.state, 'COPPING')
    assert.equal(leased.worker_id, 'worker_1')
    assert.ok(leased.leased_at != null)
    assert.ok(leased.started_at != null)
  })

  it('50 concurrent leaseNext calls on 1 WAITING run — exactly 1 wins', async () => {
    await seedWaiting()

    // JS event loop is single-threaded; all 50 Promises are created here
    // before any microtask flushes. When they resolve, only the first finds
    // a WAITING row; the rest get null. This mirrors SKIP LOCKED semantics.
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        dropRunRepository.leaseNext(`worker_${i}`),
      ),
    )

    const winners = results.filter((r) => r != null)
    const nulls = results.filter((r) => r == null)

    assert.equal(winners.length, 1)
    assert.equal(nulls.length, 49)
  })

  it('two WAITING runs — two concurrent workers each get a distinct run', async () => {
    const r1 = await dropRunRepository.insertWaiting({
      dropId: DROP_ID,
      nikeAccountId: 'acc_a',
      customerId: CUSTOMER_ID,
      attempt: 1,
    })
    const r2 = await dropRunRepository.insertWaiting({
      dropId: DROP_ID,
      nikeAccountId: 'acc_b',
      customerId: CUSTOMER_ID,
      attempt: 1,
    })

    const [w1, w2] = await Promise.all([
      dropRunRepository.leaseNext('worker_a'),
      dropRunRepository.leaseNext('worker_b'),
    ])

    assert.ok(w1 != null)
    assert.ok(w2 != null)
    assert.notEqual(w1.id, w2.id)
    assert.ok([r1.id, r2.id].includes(w1.id))
    assert.ok([r1.id, r2.id].includes(w2.id))
  })
})

// ---------------------------------------------------------------------------
// finalize → COP / SKIPPED
// ---------------------------------------------------------------------------

describe('finalize — COP', () => {
  it('transitions to COP and stores order_number', async () => {
    await seedWaiting()
    const leased = await dropRunRepository.leaseNext('w1')
    assert.ok(leased != null)

    await dropRunRepository.finalize(leased.id, 'COP', { orderNumber: 'ORD-999' })

    const runs = await dropRunRepository.listByDrop(DROP_ID)
    const run = runs.find((r) => r.id === leased.id)!
    assert.equal(run.state, 'COP')
    assert.equal(run.order_number, 'ORD-999')
    assert.ok(run.finished_at != null)
  })
})

describe('finalize — SKIPPED', () => {
  it('transitions to SKIPPED and does NOT re-queue', async () => {
    await seedWaiting()
    const leased = await dropRunRepository.leaseNext('w1')
    assert.ok(leased != null)

    await dropRunRepository.finalize(leased.id, 'SKIPPED', {
      skipReason: 'size not available',
    })

    const runs = await dropRunRepository.listByDrop(DROP_ID)
    assert.equal(runs.length, 1)
    assert.equal(runs[0]!.state, 'SKIPPED')
  })
})

// ---------------------------------------------------------------------------
// finalize → FAIL + retry chain
// ---------------------------------------------------------------------------

describe('finalize — FAIL with retryable classification', () => {
  it('inserts attempt=2 row on first FAIL with "blocked"', async () => {
    await seedWaiting()
    const leased = await dropRunRepository.leaseNext('w1')
    assert.ok(leased != null)

    await dropRunRepository.finalize(leased.id, 'FAIL', {
      errorReason: 'detected bot traffic',
      errorClassification: 'blocked',
    })

    const runs = await dropRunRepository.listByDrop(DROP_ID)
    assert.equal(runs.length, 2)

    const attempt1 = runs.find((r) => r.attempt === 1)!
    const attempt2 = runs.find((r) => r.attempt === 2)!

    assert.equal(attempt1.state, 'FAIL')
    assert.equal(attempt2.state, 'WAITING')
  })

  it('full retry chain: attempt 1 FAIL → 2 FAIL → 3 FAIL → no attempt 4', async () => {
    // Attempt 1
    await seedWaiting({ attempt: 1 })
    const l1 = await dropRunRepository.leaseNext('w1')
    assert.ok(l1 != null)
    await dropRunRepository.finalize(l1.id, 'FAIL', {
      errorClassification: 'blocked',
    })

    // Attempt 2
    const l2 = await dropRunRepository.leaseNext('w2')
    assert.ok(l2 != null)
    assert.equal(l2.attempt, 2)
    await dropRunRepository.finalize(l2.id, 'FAIL', {
      errorClassification: '3ds_timeout',
    })

    // Attempt 3
    const l3 = await dropRunRepository.leaseNext('w3')
    assert.ok(l3 != null)
    assert.equal(l3.attempt, 3)
    await dropRunRepository.finalize(l3.id, 'FAIL', {
      errorClassification: 'error',
    })

    // No attempt 4
    const remaining = await dropRunRepository.leaseNext('w4')
    assert.equal(remaining, null)

    const runs = await dropRunRepository.listByDrop(DROP_ID)
    assert.equal(runs.length, 3)
    assert.ok(runs.every((r) => r.state === 'FAIL'))
  })
})

describe('finalize — FAIL with non-retryable classification', () => {
  it('does NOT re-queue on "sold_out"', async () => {
    await seedWaiting()
    const leased = await dropRunRepository.leaseNext('w1')
    assert.ok(leased != null)

    await dropRunRepository.finalize(leased.id, 'FAIL', {
      errorClassification: 'sold_out',
    })

    const runs = await dropRunRepository.listByDrop(DROP_ID)
    assert.equal(runs.length, 1)
    assert.equal(runs[0]!.state, 'FAIL')
  })

  it('does NOT re-queue on "no_session"', async () => {
    await seedWaiting()
    const leased = await dropRunRepository.leaseNext('w1')
    assert.ok(leased != null)

    await dropRunRepository.finalize(leased.id, 'FAIL', {
      errorClassification: 'no_session',
    })

    const all = await dropRunRepository.listByDrop(DROP_ID)
    assert.equal(all.length, 1)
  })
})

// ---------------------------------------------------------------------------
// reapStale
// ---------------------------------------------------------------------------

describe('reapStale', () => {
  it('returns 0 when no stale COPPING runs', async () => {
    await seedWaiting()
    const count = await dropRunRepository.reapStale()
    assert.equal(count, 0)
  })

  it('re-queues a COPPING run older than threshold; attempt unchanged', async () => {
    await seedWaiting()
    const leased = await dropRunRepository.leaseNext('w1')
    assert.ok(leased != null)

    // Manually backdate leased_at to simulate 10-min old stale run
    // We can reach the internal store via _resetDropRunStore + re-seed with a
    // frozen leased_at. Instead, we use a 0-ms threshold to treat any COPPING
    // run as stale immediately.
    const count = await dropRunRepository.reapStale(0)
    assert.equal(count, 1)

    const runs = await dropRunRepository.listByDrop(DROP_ID)
    const run = runs[0]!
    assert.equal(run.state, 'WAITING')
    assert.equal(run.attempt, 1) // attempt NOT incremented
    assert.equal(run.worker_id, null)
    assert.equal(run.leased_at, null)
  })

  it('does not reap a recently-leased COPPING run', async () => {
    await seedWaiting()
    await dropRunRepository.leaseNext('w1')

    // Threshold = 10 minutes; the just-leased run should NOT be reaped
    const count = await dropRunRepository.reapStale(10 * 60 * 1_000)
    assert.equal(count, 0)
  })
})

// ---------------------------------------------------------------------------
// finalize on unknown runId
// ---------------------------------------------------------------------------

describe('finalize — error handling', () => {
  it('throws when runId does not exist', async () => {
    await assert.rejects(
      () => dropRunRepository.finalize('nonexistent', 'COP', {}),
      /DropRun not found/,
    )
  })
})
