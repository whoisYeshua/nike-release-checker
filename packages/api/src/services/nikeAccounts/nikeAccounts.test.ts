/**
 * Story 16.4 — Nike account credential storage tests
 *
 * Coverage matrix:
 *   - maskEmail helper
 *   - POST + GET happy path; metadata response has NO password, email_encrypted,
 *     proxy_url, or full email keys
 *   - POST same email twice for same customer → 409
 *   - POST same email for two different customers → both succeed (different DEK)
 *   - loadForWorker round-trips all plaintext fields
 *   - persistSessionSnapshot → loadForWorker returns the same snapshot object
 *   - Cross-tenant loadForWorker(idA, customerB) → throws (not found)
 *   - DELETE with in-flight drop_run → 409
 *   - DELETE without in-flight → 204
 *   - PATCH password re-encrypts (different ciphertext even for same value)
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'

import { maskEmail } from './mask.ts'
import { nikeAccountsDb } from '../../db/nikeAccounts.ts'
import { customersDb } from '../../db/customers.ts'
import { apiKeysDb } from '../../db/apiKeys.ts'
import { setKmsAdapter } from '../../crypto/dek.ts'
import { LocalKmsStub } from '../../crypto/kms.local.ts'
import { buildApp } from '../../app.ts'
import { dropRunRepository, _resetDropRunStore } from '../../drops/dropRunRepository.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'testsecretabcdefghijklmnopqrstuvwx'
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$u0H9L+Y2c+SHGicZFKfdUw$u/yrWlbPjrPJCQlXRCRNc4lPhgfUyzn8qKsn2jyIFGY'

function authHeader(keyId: string): Record<string, string> {
  return { authorization: `Bearer nrc_${keyId}_${TEST_SECRET}` }
}

let _keyCounter = 0

async function seedCustomer(email: string): Promise<{ customerId: string; keyId: string }> {
  const customer = await customersDb.create({
    email,
    tier: 'pro',
    default_currency: 'USD',
  })
  const keyId = `key${String(++_keyCounter).padStart(3, '0')}`
  apiKeysDb._seed({
    key_id: keyId,
    customer_id: customer.id,
    secret_hash: TEST_HASH,
    label: 'test-key',
    created_at: new Date(),
  })
  return { customerId: customer.id, keyId }
}

// ---------------------------------------------------------------------------
// Unit: maskEmail
// ---------------------------------------------------------------------------

describe('maskEmail', () => {
  it('masks standard email', () => {
    assert.equal(maskEmail('john.smith@gmail.com'), 'j***@gmail.com')
  })

  it('single-char local part', () => {
    assert.equal(maskEmail('j@example.org'), 'j***@example.org')
  })

  it('no @ sign returns ***', () => {
    assert.equal(maskEmail('notanemail'), '***')
  })

  it('@ at position 0 returns ***', () => {
    assert.equal(maskEmail('@domain.com'), '***')
  })
})

// ---------------------------------------------------------------------------
// DB layer: nikeAccountsDb
// ---------------------------------------------------------------------------

describe('nikeAccountsDb', () => {
  beforeEach(() => {
    setKmsAdapter(new LocalKmsStub())
    customersDb._clear()
    apiKeysDb._clear()
    nikeAccountsDb._clear()
    _resetDropRunStore()
    _keyCounter = 0
  })

  it('create → getMetadata round-trip returns masked email, no sensitive fields', async () => {
    const { customerId } = await seedCustomer('alice@test.com')
    const meta = await nikeAccountsDb.create(customerId, {
      email: 'Alice@Test.COM',
      password: 'secret123',
      country: 'US',
    })

    assert.ok(meta.id)
    assert.equal(meta.country, 'US')
    assert.match(meta.email_masked, /^a\*\*\*@test\.com$/)
    assert.equal(meta.session_status, 'unknown')

    // No sensitive keys in the returned object
    const serialised = JSON.stringify(meta)
    assert.ok(!serialised.includes('password'), 'password must not appear in meta')
    assert.ok(!serialised.includes('email_encrypted'), 'email_encrypted must not appear')
    assert.ok(!serialised.includes('proxy_url'), 'proxy_url must not appear (unless it is allowed meta)')
    // Full email should not appear (only masked version)
    assert.ok(!serialised.includes('alice@test.com'), 'full email must not appear in meta')
    assert.ok(!serialised.includes('Alice@Test.COM'), 'full email (original case) must not appear')

    const fetched = await nikeAccountsDb.getMetadata(meta.id, customerId)
    assert.ok(fetched)
    assert.equal(fetched.id, meta.id)
    assert.match(fetched.email_masked, /^a\*\*\*@test\.com$/)
  })

  it('duplicate email for same customer → conflict error (code 409)', async () => {
    const { customerId } = await seedCustomer('bob@test.com')
    await nikeAccountsDb.create(customerId, { email: 'bob@test.com', password: 'p1', country: 'GB' })

    await assert.rejects(
      () => nikeAccountsDb.create(customerId, { email: 'BOB@test.COM', password: 'p2', country: 'DE' }),
      (err) => {
        const e = err as { code?: string; statusCode?: number }
        assert.equal(e.code, 'nike_account_already_registered')
        assert.equal(e.statusCode, 409)
        return true
      },
    )
  })

  it('same email for two different customers → both succeed', async () => {
    const { customerId: c1 } = await seedCustomer('customerA@test.com')
    const { customerId: c2 } = await seedCustomer('customerB@test.com')

    const m1 = await nikeAccountsDb.create(c1, { email: 'shared@nike.com', password: 'passA', country: 'US' })
    const m2 = await nikeAccountsDb.create(c2, { email: 'shared@nike.com', password: 'passB', country: 'FR' })

    assert.ok(m1.id)
    assert.ok(m2.id)
    assert.notEqual(m1.id, m2.id)
  })

  it('loadForWorker round-trips all plaintext fields', async () => {
    const { customerId } = await seedCustomer('worker@test.com')
    const meta = await nikeAccountsDb.create(customerId, {
      email: 'worker@nike.com',
      password: 'hunter2',
      country: 'US',
      proxy_url: 'http://proxy.example.com:8080',
      preferred_sizes: ['9', '10'],
    })

    const pt = await nikeAccountsDb.loadForWorker(meta.id, customerId)
    assert.equal(pt.email, 'worker@nike.com')
    assert.equal(pt.password, 'hunter2')
    assert.equal(pt.proxy_url, 'http://proxy.example.com:8080')
    assert.equal(pt.country, 'US')
    assert.deepEqual(pt.preferred_sizes, ['9', '10'])
    assert.equal(pt.session_snapshot, null)
  })

  it('persistSessionSnapshot → loadForWorker returns same snapshot', async () => {
    const { customerId } = await seedCustomer('snap@test.com')
    const meta = await nikeAccountsDb.create(customerId, {
      email: 'snap@nike.com',
      password: 'pass',
      country: 'US',
    })

    const snapshot = {
      cookies: [{ name: '_abck', value: 'abc123', domain: '.nike.com' }],
      localStorage: {},
      kpsdk: { ct: 'xxx', v: '1', expiresAt: 9999999999 },
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1280, height: 800 },
    }

    await nikeAccountsDb.persistSessionSnapshot(meta.id, customerId, snapshot)
    const pt = await nikeAccountsDb.loadForWorker(meta.id, customerId)

    assert.deepEqual(pt.session_snapshot, snapshot)
  })

  it('cross-tenant loadForWorker(idA, customerB) throws not found', async () => {
    const { customerId: c1 } = await seedCustomer('tenant1@test.com')
    const { customerId: c2 } = await seedCustomer('tenant2@test.com')

    const meta = await nikeAccountsDb.create(c1, { email: 'acct@nike.com', password: 'p', country: 'US' })

    await assert.rejects(
      () => nikeAccountsDb.loadForWorker(meta.id, c2),
      (err) => {
        const e = err as { code?: string }
        assert.equal(e.code, 'not_found')
        return true
      },
    )
  })

  it('update (PATCH) re-encrypts password to a different ciphertext', async () => {
    const { customerId } = await seedCustomer('patch@test.com')
    const meta = await nikeAccountsDb.create(customerId, {
      email: 'patch@nike.com',
      password: 'original',
      country: 'US',
    })

    const rawBefore = nikeAccountsDb._getRaw(meta.id)
    const blobBefore = Buffer.from(rawBefore!.password_encrypted)

    await nikeAccountsDb.update(meta.id, customerId, { password: 'original' })

    const rawAfter = nikeAccountsDb._getRaw(meta.id)
    // IV is random, so even the same password produces a different ciphertext
    assert.notDeepEqual(rawAfter!.password_encrypted, blobBefore)
  })

  it('listMetadata is customer-scoped', async () => {
    const { customerId: c1 } = await seedCustomer('list1@test.com')
    const { customerId: c2 } = await seedCustomer('list2@test.com')

    await nikeAccountsDb.create(c1, { email: 'a@nike.com', password: 'p', country: 'US' })
    await nikeAccountsDb.create(c2, { email: 'b@nike.com', password: 'p', country: 'GB' })

    const page = await nikeAccountsDb.listMetadata(c1, undefined, 50)
    assert.equal(page.data.length, 1)
    assert.match(page.data[0]!.email_masked, /^a\*\*\*/)
  })
})

// ---------------------------------------------------------------------------
// HTTP integration tests
// ---------------------------------------------------------------------------

describe('Nike accounts REST endpoints', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  let customerId: string
  let keyId: string
  let keyId2: string

  beforeEach(async () => {
    setKmsAdapter(new LocalKmsStub())
    customersDb._clear()
    apiKeysDb._clear()
    nikeAccountsDb._clear()
    _resetDropRunStore()
    _keyCounter = 0

    const c1 = await seedCustomer('http1@test.com')
    customerId = c1.customerId
    keyId = c1.keyId

    const c2 = await seedCustomer('http2@test.com')
    keyId2 = c2.keyId

    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    customersDb._clear()
    apiKeysDb._clear()
    nikeAccountsDb._clear()
    _resetDropRunStore()
    setKmsAdapter(null)
  })

  it('POST /v1/account/nike-accounts → 201, metadata shape, no sensitive fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/nike-accounts',
      headers: authHeader(keyId),
      payload: {
        email: 'test@nike.com',
        password: 'secret',
        country: 'US',
        preferred_sizes: ['10'],
      },
    })

    assert.equal(res.statusCode, 201)
    const body = res.json() as Record<string, unknown>
    assert.ok(body['id'])
    assert.equal(body['country'], 'US')
    assert.match(String(body['email_masked']), /^t\*\*\*@nike\.com$/)

    // Sensitive fields MUST NOT appear
    const raw = res.body
    assert.ok(!raw.includes('"password"'), 'password key must be absent')
    assert.ok(!raw.includes('"email_encrypted"'), 'email_encrypted must be absent')
    assert.ok(!raw.includes('secret'), 'password value must be absent')
    assert.ok(!raw.includes('test@nike.com'), 'full email must be absent')

    assert.equal(res.headers['location'], `/v1/account/nike-accounts/${body['id']}`)
  })

  it('GET /v1/account/nike-accounts/:id → 200 with metadata', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/v1/account/nike-accounts',
      headers: authHeader(keyId),
      payload: { email: 'get@nike.com', password: 'p', country: 'FR' },
    })
    const { id } = post.json() as { id: string }

    const res = await app.inject({
      method: 'GET',
      url: `/v1/account/nike-accounts/${id}`,
      headers: authHeader(keyId),
    })

    assert.equal(res.statusCode, 200)
    const body = res.json() as Record<string, unknown>
    assert.equal(body['id'], id)
    assert.match(String(body['email_masked']), /^g\*\*\*@nike\.com$/)
  })

  it('GET /v1/account/nike-accounts/:id of another customer → 404', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/v1/account/nike-accounts',
      headers: authHeader(keyId),
      payload: { email: 'xsec@nike.com', password: 'p', country: 'US' },
    })
    const { id } = post.json() as { id: string }

    const res = await app.inject({
      method: 'GET',
      url: `/v1/account/nike-accounts/${id}`,
      headers: authHeader(keyId2),
    })
    assert.equal(res.statusCode, 404)
  })

  it('POST duplicate email for same customer → 409', async () => {
    const payload = { email: 'dup@nike.com', password: 'p', country: 'US' }
    await app.inject({ method: 'POST', url: '/v1/account/nike-accounts', headers: authHeader(keyId), payload })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/nike-accounts',
      headers: authHeader(keyId),
      payload,
    })
    assert.equal(res.statusCode, 409)
  })

  it('POST same email for two different customers → both 201', async () => {
    const payload = { email: 'shared@nike.com', password: 'p', country: 'US' }
    const r1 = await app.inject({ method: 'POST', url: '/v1/account/nike-accounts', headers: authHeader(keyId), payload })
    const r2 = await app.inject({ method: 'POST', url: '/v1/account/nike-accounts', headers: authHeader(keyId2), payload })

    assert.equal(r1.statusCode, 201)
    assert.equal(r2.statusCode, 201)
  })

  it('GET /v1/account/nike-accounts → paginated list', async () => {
    await app.inject({ method: 'POST', url: '/v1/account/nike-accounts', headers: authHeader(keyId), payload: { email: 'a@nike.com', password: 'p', country: 'US' } })
    await app.inject({ method: 'POST', url: '/v1/account/nike-accounts', headers: authHeader(keyId), payload: { email: 'b@nike.com', password: 'p', country: 'US' } })

    const res = await app.inject({ method: 'GET', url: '/v1/account/nike-accounts', headers: authHeader(keyId) })
    assert.equal(res.statusCode, 200)
    const body = res.json() as { data: unknown[]; next_cursor: string | null }
    assert.equal(body.data.length, 2)
    assert.equal(body.next_cursor, null)
  })

  it('PATCH /v1/account/nike-accounts/:id → 204', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/v1/account/nike-accounts',
      headers: authHeader(keyId),
      payload: { email: 'patch@nike.com', password: 'original', country: 'US' },
    })
    const { id } = post.json() as { id: string }

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/account/nike-accounts/${id}`,
      headers: authHeader(keyId),
      payload: { password: 'rotated' },
    })
    assert.equal(res.statusCode, 204)
  })

  it('DELETE without in-flight drop_run → 204', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/v1/account/nike-accounts',
      headers: authHeader(keyId),
      payload: { email: 'del@nike.com', password: 'p', country: 'US' },
    })
    const { id } = post.json() as { id: string }

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/account/nike-accounts/${id}`,
      headers: authHeader(keyId),
    })
    assert.equal(res.statusCode, 204)

    // Confirm actually deleted
    const get = await app.inject({
      method: 'GET',
      url: `/v1/account/nike-accounts/${id}`,
      headers: authHeader(keyId),
    })
    assert.equal(get.statusCode, 404)
  })

  it('DELETE with in-flight drop_run (WAITING) → 409', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/v1/account/nike-accounts',
      headers: authHeader(keyId),
      payload: { email: 'inflight@nike.com', password: 'p', country: 'US' },
    })
    const { id } = post.json() as { id: string }

    // Simulate an in-flight drop run for this nike account
    await dropRunRepository.insertWaiting({
      dropId: 'drp_test',
      nikeAccountId: id,
      customerId,
      attempt: 1,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/account/nike-accounts/${id}`,
      headers: authHeader(keyId),
    })
    assert.equal(res.statusCode, 409)
  })
})
