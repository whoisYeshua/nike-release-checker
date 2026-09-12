/**
 * Story 16.3 — Card vault tests
 *
 * Coverage matrix:
 *   - encryptField / decryptField round-trip
 *   - IV non-determinism (two encrypts of same plaintext differ)
 *   - Tampered ciphertext → auth-tag-mismatch thrown
 *   - Cross-customer isolation: decrypt A's blob with B's DEK throws
 *   - Luhn-invalid PAN → cardsDb.create throws invalid_card_number
 *   - Create + getPlaintextForWorker round-trip restores plaintext exactly
 *   - POST /v1/account/cards → response body contains no PAN / CVV / *_encrypted keys
 *   - GET /v1/account/cards/:id of another customer's card → 404
 *   - Audit log row written with last4 only (stdout scan)
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { randomBytes } from 'node:crypto'

import { encryptField, decryptField } from '../../crypto/fieldCrypto.ts'
import { isLuhnValid, inferBrand, last4 as panLast4, maskHolder } from './panUtils.ts'
import { cardsDb } from '../../db/cards.ts'
import { customersDb } from '../../db/customers.ts'
import { apiKeysDb } from '../../db/apiKeys.ts'
import { setKmsAdapter } from '../../crypto/dek.ts'
import { LocalKmsStub } from '../../crypto/kms.local.ts'
import { buildApp } from '../../app.ts'
import { getDek } from '../../crypto/dekCache.ts'
import { audit } from '../audit.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_VISA = '4532015112830366' // passes Luhn
const VALID_MC   = '5425233430109903' // passes Luhn
const INVALID_PAN = '1234567890123456'  // fails Luhn

const TEST_SECRET = 'testsecretabcdefghijklmnopqrstuvwx'
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$u0H9L+Y2c+SHGicZFKfdUw$u/yrWlbPjrPJCQlXRCRNc4lPhgfUyzn8qKsn2jyIFGY'

function authHeader(keyId: string): Record<string, string> {
  return { authorization: `Bearer nrc_${keyId}_${TEST_SECRET}` }
}

// ---------------------------------------------------------------------------
// fieldCrypto unit tests
// ---------------------------------------------------------------------------

describe('fieldCrypto — AES-256-GCM primitives', () => {
  it('round-trip: encryptField → decryptField restores plaintext', () => {
    const dek = randomBytes(32)
    const plaintext = 'Hello, PCI-DSS world!'
    const blob = encryptField(plaintext, dek)
    assert.equal(decryptField(blob, dek), plaintext)
  })

  it('encryptField is non-deterministic (fresh IV per call)', () => {
    const dek = randomBytes(32)
    const blob1 = encryptField('test', dek)
    const blob2 = encryptField('test', dek)
    assert.notDeepEqual(blob1, blob2, 'Two encrypts of the same plaintext must differ (different IV)')
  })

  it('tampered ciphertext throws auth-tag-mismatch', () => {
    const dek = randomBytes(32)
    const blob = encryptField('sensitive', dek)
    // Flip a byte in the middle (ciphertext area)
    const tampered = Buffer.from(blob)
    tampered[16] ^= 0xff // byte 16 is in ciphertext (after 12-byte IV)
    assert.throws(
      () => decryptField(tampered, dek),
      /Unsupported state|unable to authenticate/i,
      'Tampered blob must throw AEAD error',
    )
  })

  it('cross-key isolation: decrypting with wrong key throws', () => {
    const dekA = randomBytes(32)
    const dekB = randomBytes(32)
    const blob = encryptField('secret', dekA)
    assert.throws(
      () => decryptField(blob, dekB),
      /Unsupported state|unable to authenticate/i,
      'Wrong key must throw AEAD error',
    )
  })

  it('rejects dek that is not 32 bytes', () => {
    const shortDek = randomBytes(16)
    assert.throws(() => encryptField('hello', shortDek), /32 bytes/)
    assert.throws(() => decryptField(randomBytes(40), shortDek), /32 bytes/)
  })
})

// ---------------------------------------------------------------------------
// panUtils unit tests
// ---------------------------------------------------------------------------

describe('panUtils', () => {
  it('isLuhnValid — valid Visa PAN passes', () => {
    assert.ok(isLuhnValid(VALID_VISA))
  })

  it('isLuhnValid — invalid PAN fails', () => {
    assert.ok(!isLuhnValid(INVALID_PAN))
  })

  it('inferBrand — Visa prefix', () => {
    assert.equal(inferBrand(VALID_VISA), 'visa')
  })

  it('inferBrand — Mastercard prefix', () => {
    assert.equal(inferBrand(VALID_MC), 'mastercard')
  })

  it('last4 — returns trailing 4 digits', () => {
    assert.equal(panLast4(VALID_VISA), '0366')
  })

  it('maskHolder — "John Doe" → "John D."', () => {
    assert.equal(maskHolder('John Doe'), 'John D.')
  })

  it('maskHolder — single name passes through unchanged', () => {
    assert.equal(maskHolder('Madonna'), 'Madonna')
  })
})

// ---------------------------------------------------------------------------
// cardsDb integration tests (in-memory)
// ---------------------------------------------------------------------------

describe('cardsDb', () => {
  beforeEach(() => {
    setKmsAdapter(new LocalKmsStub())
    customersDb._clear()
    cardsDb._clear()
  })
  afterEach(() => {
    customersDb._clear()
    cardsDb._clear()
    setKmsAdapter(null)
  })

  it('create + getPlaintextForWorker round-trip restores all fields exactly', async () => {
    const customer = await customersDb.create({ email: 'alice@test.com' })
    const meta = await cardsDb.create(customer.id, {
      holder_name: 'Alice Smith',
      card_number: VALID_VISA,
      expiry: '12/26',
      cvv: '123',
    })

    assert.equal(meta.last4, '0366')
    assert.equal(meta.brand, 'visa')
    assert.equal(meta.holder_name_masked, 'Alice S.')
    assert.equal(meta.expiry_month, '12')
    assert.equal(meta.expiry_year_yy, '26')

    const pt = await cardsDb.getPlaintextForWorker(meta.id, customer.id)
    assert.equal(pt.holder_name, 'Alice Smith')
    assert.equal(pt.card_number, VALID_VISA)
    assert.equal(pt.expiry, '12/26')
    assert.equal(pt.cvv, '123')
  })

  it('cross-customer isolation: decrypt A blob with B DEK throws', async () => {
    const customerA = await customersDb.create({ email: 'a@test.com' })
    const customerB = await customersDb.create({ email: 'b@test.com' })

    await cardsDb.create(customerA.id, {
      holder_name: 'Alice A',
      card_number: VALID_VISA,
      expiry: '01/27',
      cvv: '111',
    })

    const dekA = await getDek(customerA.id)
    const dekB = await getDek(customerB.id)

    // Direct crypto check: A's encrypted blob won't decrypt with B's DEK
    const rawBlobA = encryptField('test-isolation', dekA)
    assert.throws(
      () => decryptField(rawBlobA, dekB),
      /Unsupported state|unable to authenticate/i,
    )
  })

  it('Luhn-invalid PAN throws invalid_card_number (400)', async () => {
    const customer = await customersDb.create({ email: 'luhn@test.com' })
    await assert.rejects(
      () => cardsDb.create(customer.id, {
        holder_name: 'Test User',
        card_number: INVALID_PAN,
        expiry: '01/27',
        cvv: '999',
      }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'invalid_card_number')
        return true
      },
    )
  })

  it('getMetadata returns null for another customer card id', async () => {
    const customerA = await customersDb.create({ email: 'a@test.com' })
    const customerB = await customersDb.create({ email: 'b@test.com' })
    const meta = await cardsDb.create(customerA.id, {
      holder_name: 'Alice A',
      card_number: VALID_VISA,
      expiry: '06/28',
      cvv: '321',
    })
    const result = await cardsDb.getMetadata(meta.id, customerB.id)
    assert.equal(result, null, 'Cross-customer getMetadata must return null')
  })

  it('remove returns false for another customer card id', async () => {
    const customerA = await customersDb.create({ email: 'a@test.com' })
    const customerB = await customersDb.create({ email: 'b@test.com' })
    const meta = await cardsDb.create(customerA.id, {
      holder_name: 'Alice A',
      card_number: VALID_VISA,
      expiry: '06/28',
      cvv: '321',
    })
    const ok = await cardsDb.remove(meta.id, customerB.id)
    assert.equal(ok, false, 'Cross-customer remove must return false')
  })
})

// ---------------------------------------------------------------------------
// REST integration tests
// ---------------------------------------------------------------------------

describe('POST /v1/account/cards — response leakage matrix', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    setKmsAdapter(new LocalKmsStub())
    customersDb._clear()
    cardsDb._clear()
    apiKeysDb._clear()
    audit._clear()

    const customer = await customersDb.create({ email: 'rest-test@example.com' })
    apiKeysDb._seed({
      key_id: 'key001',
      customer_id: customer.id,
      secret_hash: TEST_HASH,
      label: 'test-key',
      created_at: new Date(),
    })

    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
    customersDb._clear()
    cardsDb._clear()
    apiKeysDb._clear()
    setKmsAdapter(null)
  })

  it('POST /v1/account/cards — response body contains no PAN, CVV, or *_encrypted keys', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/account/cards',
      headers: authHeader('key001'),
      payload: {
        holder_name: 'Test User',
        card_number: VALID_VISA,
        expiry: '12/26',
        cvv: '123',
      },
    })

    assert.equal(response.statusCode, 201)
    const body = response.body

    // Assert no sensitive fields appear in the raw response string
    assert.ok(!body.includes('card_number'), 'card_number must not appear in response')
    assert.ok(!body.includes('cvv'), 'cvv must not appear in response')
    assert.ok(!body.includes('_encrypted'), '_encrypted fields must not appear in response')
    assert.ok(!body.includes(VALID_VISA), 'raw PAN must not appear in response')

    const json = JSON.parse(body) as Record<string, unknown>
    assert.ok('id' in json)
    assert.ok('brand' in json)
    assert.ok('last4' in json)
    assert.ok('holder_name_masked' in json)
  })

  it('GET /v1/account/cards/:id of another customer returns 404', async () => {
    // Create a card for the test customer
    const postResp = await app.inject({
      method: 'POST',
      url: '/v1/account/cards',
      headers: authHeader('key001'),
      payload: {
        holder_name: 'Test User',
        card_number: VALID_VISA,
        expiry: '12/26',
        cvv: '123',
      },
    })
    assert.equal(postResp.statusCode, 201)
    const { id } = JSON.parse(postResp.body) as { id: string }

    // Create a second customer + key
    const otherCustomer = await customersDb.create({ email: 'other@example.com' })
    apiKeysDb._seed({
      key_id: 'key002',
      customer_id: otherCustomer.id,
      secret_hash: TEST_HASH,
      label: 'other-key',
      created_at: new Date(),
    })

    const getResp = await app.inject({
      method: 'GET',
      url: `/v1/account/cards/${id}`,
      headers: authHeader('key002'),
    })
    assert.equal(getResp.statusCode, 404, 'Cross-customer GET must return 404')
  })

  it('POST /v1/account/cards — Luhn-invalid PAN returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/account/cards',
      headers: authHeader('key001'),
      payload: {
        holder_name: 'Test User',
        card_number: INVALID_PAN,
        expiry: '12/26',
        cvv: '123',
      },
    })
    assert.equal(response.statusCode, 400)
  })

  it('DELETE /v1/account/cards/:id hard-deletes and returns 204', async () => {
    const postResp = await app.inject({
      method: 'POST',
      url: '/v1/account/cards',
      headers: authHeader('key001'),
      payload: {
        holder_name: 'Test User',
        card_number: VALID_VISA,
        expiry: '12/26',
        cvv: '123',
      },
    })
    assert.equal(postResp.statusCode, 201)
    const { id } = JSON.parse(postResp.body) as { id: string }

    const delResp = await app.inject({
      method: 'DELETE',
      url: `/v1/account/cards/${id}`,
      headers: authHeader('key001'),
    })
    assert.equal(delResp.statusCode, 204)

    // Confirm card is gone
    const getResp = await app.inject({
      method: 'GET',
      url: `/v1/account/cards/${id}`,
      headers: authHeader('key001'),
    })
    assert.equal(getResp.statusCode, 404)
  })

  it('audit log for card.create contains no PAN, CVV, or full holder_name', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/account/cards',
      headers: authHeader('key001'),
      payload: {
        holder_name: 'Audit Test User',
        card_number: VALID_VISA,
        expiry: '12/26',
        cvv: '999',
      },
    })

    const rows = audit._findByAction('card.create')
    assert.ok(rows.length >= 1, 'audit row must exist')
    const payloadStr = rows[rows.length - 1]!.payload_redacted_json ?? ''
    assert.ok(!payloadStr.includes(VALID_VISA), 'PAN must not appear in audit payload')
    assert.ok(!payloadStr.includes('999'), 'CVV must not appear in audit payload')
    assert.ok(!payloadStr.includes('Audit Test User'), 'holder_name must not appear in audit payload')
    assert.ok(!payloadStr.includes('12/26'), 'expiry must not appear in audit payload')
    assert.equal(rows[rows.length - 1]!.resource_type, 'card', 'resource_type must be "card" not "drop"')
  })
})
