import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { apiKeysDb } from '../../db/apiKeys.ts'
import { dropsDb } from '../../db/drops.ts'
import { scheduler } from '../../services/scheduler.ts'
import { buildApp } from '../../app.ts'

// ---------------------------------------------------------------------------
// Auth setup
// Pre-computed argon2id hash for 'testsecretabcdefghijklmnopqrstuvwx' (32 chars)
// ---------------------------------------------------------------------------
const TEST_SECRET = 'testsecretabcdefghijklmnopqrstuvwx'
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$u0H9L+Y2c+SHGicZFKfdUw$u/yrWlbPjrPJCQlXRCRNc4lPhgfUyzn8qKsn2jyIFGY'

const CUSTOMER_A = 'cust_aaa'
const CUSTOMER_B = 'cust_bbb'
const KEY_A = 'keya0001'
const KEY_B = 'keyb0001'
const TOKEN_A = `nrc_${KEY_A}_${TEST_SECRET}`
const TOKEN_B = `nrc_${KEY_B}_${TEST_SECRET}`

function seedKeys(): void {
  apiKeysDb._seed({
    key_id: KEY_A,
    customer_id: CUSTOMER_A,
    secret_hash: TEST_HASH,
    created_at: new Date(),
  })
  apiKeysDb._seed({
    key_id: KEY_B,
    customer_id: CUSTOMER_B,
    secret_hash: TEST_HASH,
    created_at: new Date(),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/drops', () => {
  beforeEach(() => {
    apiKeysDb._clear()
    dropsDb._reset()
    scheduler._reset()
    seedKeys()
  })

  it('201 happy path — creates drop in DRAFT state with Location header', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drops',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      payload: {
        country: 'FR',
        sku: 'DV3854-100',
        sizes: ['42', '42.5'],
        maxAccounts: 5,
        paymentMethodId: 'card_xyz',
        scheduledAt: '2026-05-01T08:00:00Z',
      },
    })
    assert.equal(res.statusCode, 201)
    const body = res.json<{ id: string; state: string }>()
    assert.equal(body.state, 'DRAFT')
    assert.ok(body.id.startsWith('drp_'))
    assert.ok(res.headers['location']?.includes(body.id))
    // Verify customerId scoping
    const row = dropsDb.findById(body.id, CUSTOMER_A)
    assert.ok(row != null)
    assert.equal(row.customer_id, CUSTOMER_A)
    await app.close()
  })

  it('400 bad country code (full name)', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drops',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      payload: {
        country: 'france',
        sku: 'DV3854-100',
        sizes: ['42'],
        maxAccounts: 5,
        paymentMethodId: 'card_xyz',
      },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })

  it('400 bad sku format', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drops',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      payload: {
        country: 'FR',
        sku: 'bad sku!',
        sizes: ['42'],
        maxAccounts: 5,
        paymentMethodId: 'card_xyz',
      },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })

  it('400 empty sizes array', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drops',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      payload: {
        country: 'FR',
        sku: 'DV3854-100',
        sizes: [],
        maxAccounts: 5,
        paymentMethodId: 'card_xyz',
      },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })

  it('400 maxAccounts > 500', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drops',
      headers: { authorization: `Bearer ${TOKEN_A}` },
      payload: {
        country: 'FR',
        sku: 'DV3854-100',
        sizes: ['42'],
        maxAccounts: 501,
        paymentMethodId: 'card_xyz',
      },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })
})

describe('GET /v1/drops/:id', () => {
  beforeEach(() => {
    apiKeysDb._clear()
    dropsDb._reset()
    seedKeys()
  })

  it('200 happy path — returns drop with runs summary', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 2,
      paymentMethodId: 'pm_test',
    })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/drops/${drop.id}`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json<{ id: string; runs: { total: number } }>()
    assert.equal(body.id, drop.id)
    assert.equal(body.runs.total, 0)
    await app.close()
  })

  it('404 cross-tenant — customer B cannot see customer A drop', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 2,
      paymentMethodId: 'pm_test',
    })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/drops/${drop.id}`,
      headers: { authorization: `Bearer ${TOKEN_B}` },
    })
    // Must be 404 not 403 — no existence leak
    assert.equal(res.statusCode, 404)
    await app.close()
  })
})

describe('POST /v1/drops/:id/run', () => {
  beforeEach(() => {
    apiKeysDb._clear()
    dropsDb._reset()
    scheduler._reset()
    seedKeys()
  })

  it('202 DRAFT drop transitions to ACTIVE and enqueues', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    const res = await app.inject({
      method: 'POST',
      url: `/v1/drops/${drop.id}/run`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 202)
    const updated = dropsDb.findById(drop.id, CUSTOMER_A)
    assert.equal(updated?.state, 'ACTIVE')
    assert.equal(scheduler._getQueue().length, 1)
    await app.close()
  })

  it('202 DRAFT with future scheduledAt transitions to SCHEDULED', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
      scheduledAt: '2030-01-01T12:00:00Z',
    })
    const res = await app.inject({
      method: 'POST',
      url: `/v1/drops/${drop.id}/run`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 202)
    const updated = dropsDb.findById(drop.id, CUSTOMER_A)
    assert.equal(updated?.state, 'SCHEDULED')
    await app.close()
  })

  it('409 when drop is already ACTIVE', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    dropsDb.updateState(drop.id, CUSTOMER_A, ['DRAFT'], 'ACTIVE')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/drops/${drop.id}/run`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 409)
    await app.close()
  })
})

describe('DELETE /v1/drops/:id', () => {
  beforeEach(() => {
    apiKeysDb._clear()
    dropsDb._reset()
    seedKeys()
  })

  it('204 cancels a DRAFT drop', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/drops/${drop.id}`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 204)
    const updated = dropsDb.findById(drop.id, CUSTOMER_A)
    assert.equal(updated?.state, 'CANCELLED')
    await app.close()
  })

  it('409 cannot cancel COMPLETED drop', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    dropsDb.updateState(drop.id, CUSTOMER_A, ['DRAFT'], 'ACTIVE')
    dropsDb.updateState(drop.id, CUSTOMER_A, ['ACTIVE'], 'COMPLETED')
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/drops/${drop.id}`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 409)
    await app.close()
  })

  it('409 cross-tenant delete returns 409 (no existence leak)', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    // Customer B tries to delete customer A's drop — updateState returns null → 409
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/drops/${drop.id}`,
      headers: { authorization: `Bearer ${TOKEN_B}` },
    })
    assert.equal(res.statusCode, 409)
    await app.close()
  })
})

describe('GET /v1/drops/:id/orders', () => {
  beforeEach(() => {
    apiKeysDb._clear()
    dropsDb._reset()
    seedKeys()
  })

  it('200 returns paginated orders for a drop', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    dropsDb._insertOrder({
      drop_id: drop.id,
      customer_id: CUSTOMER_A,
      nike_order_number: 'NK-001',
      total_amount_cents: 19000,
      currency: 'USD',
      status: 'confirmed',
      drop_run_id: 'run_001',
    })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/drops/${drop.id}/orders`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json<{ data: unknown[]; cursor: string | null }>()
    assert.equal(body.data.length, 1)
    await app.close()
  })

  it('cursor round-trips correctly', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 5,
      paymentMethodId: 'pm_test',
    })
    // Insert 3 orders with staggered timestamps
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((r) => setTimeout(r, 2)) // ensure distinct created_at
      dropsDb._insertOrder({
        drop_id: drop.id,
        customer_id: CUSTOMER_A,
        nike_order_number: `NK-00${i}`,
        total_amount_cents: 10000,
        currency: 'USD',
        status: 'confirmed',
        drop_run_id: 'run_001',
      })
    }
    const page1 = await app.inject({
      method: 'GET',
      url: `/v1/drops/${drop.id}/orders?limit=2`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(page1.statusCode, 200)
    const body1 = page1.json<{ data: unknown[]; cursor: string | null }>()
    assert.equal(body1.data.length, 2)
    assert.ok(body1.cursor != null)

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/drops/${drop.id}/orders?limit=2&cursor=${encodeURIComponent(body1.cursor!)}`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(page2.statusCode, 200)
    const body2 = page2.json<{ data: unknown[]; cursor: string | null }>()
    assert.equal(body2.data.length, 1)
    assert.equal(body2.cursor, null)
    await app.close()
  })

  it('400 limit > 200', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/drops/${drop.id}/orders?limit=201`,
      headers: { authorization: `Bearer ${TOKEN_A}` },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })

  it('404 cross-tenant orders returns 404', async () => {
    const app = await buildApp()
    const drop = dropsDb.create({
      customerId: CUSTOMER_A,
      country: 'US',
      sku: 'AB1234-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
    })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/drops/${drop.id}/orders`,
      headers: { authorization: `Bearer ${TOKEN_B}` },
    })
    assert.equal(res.statusCode, 404)
    await app.close()
  })
})
