/**
 * Tests for Story 16.2 — Per-Customer KMS Key (DEK derivation + cache)
 *
 * All tests run offline using LocalKmsStub (NODE_ENV=test).
 *
 * Coverage:
 *   - Cross-customer isolation: two customers get different DEKs
 *   - Salt binding: wrong salt → wrong DEK → AEAD auth failure on decrypt
 *   - Mixed-input isolation: (wrapped_A, salt_B, id_A) ≠ (wrapped_A, salt_A, id_A)
 *   - Cache hit: second getDek call within TTL does not call deriveDek again
 *   - invalidateDek: forces re-derivation and zeroes old buffer
 *   - LRU dispose zeroes buffer bytes
 *   - KmsAdapter swap: LocalKmsStub + in-memory mock of AwsKmsAdapter both work
 */

import assert from 'node:assert/strict'
import { test, describe, beforeEach, afterEach } from 'node:test'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { provisionDek, deriveDek, setKmsAdapter } from './dek.ts'
import { getDek, invalidateDek } from './dekCache.ts'
import { customersDb } from '../db/customers.ts'
import { LocalKmsStub } from './kms.local.ts'
import type { KmsAdapter } from './kms.ts'

// ---------------------------------------------------------------------------
// Helper: AES-256-GCM round-trip with a DEK
// ---------------------------------------------------------------------------
function aesEncrypt(key: Buffer, plaintext: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct])
}

function aesDecrypt(key: Buffer, wrapped: Buffer): string {
  const iv = wrapped.subarray(0, 12)
  const tag = wrapped.subarray(12, 28)
  const ct = wrapped.subarray(28)
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}

// ---------------------------------------------------------------------------
// Describe: DEK isolation
// ---------------------------------------------------------------------------
describe('DEK cross-customer isolation', () => {
  beforeEach(() => setKmsAdapter(new LocalKmsStub()))
  afterEach(() => setKmsAdapter(null))

  test('two customers produce different 32-byte DEKs', async () => {
    const { dek_wrapped: wA, dek_salt: sA } = await provisionDek('cust-A')
    const { dek_wrapped: wB, dek_salt: sB } = await provisionDek('cust-B')
    const dekA = await deriveDek(wA, sA, 'cust-A')
    const dekB = await deriveDek(wB, sB, 'cust-B')
    try {
      assert.equal(dekA.length, 32, 'DEK must be 32 bytes')
      assert.equal(dekB.length, 32, 'DEK must be 32 bytes')
      assert.notDeepEqual(dekA, dekB, 'DEKs must differ across customers')
    } finally {
      dekA.fill(0)
      dekB.fill(0)
    }
  })

  test("ciphertext encrypted with A's DEK cannot be decrypted with B's DEK", async () => {
    const { dek_wrapped: wA, dek_salt: sA } = await provisionDek('cust-A')
    const { dek_wrapped: wB, dek_salt: sB } = await provisionDek('cust-B')
    const dekA = await deriveDek(wA, sA, 'cust-A')
    const dekB = await deriveDek(wB, sB, 'cust-B')
    try {
      const ct = aesEncrypt(dekA, 'secret-data')
      assert.throws(
        () => aesDecrypt(dekB, ct),
        /Unsupported state or unable to authenticate data/,
        'Cross-customer decrypt must throw AEAD auth error',
      )
    } finally {
      dekA.fill(0)
      dekB.fill(0)
    }
  })

  test('salt binds the DEK: wrong salt cannot decrypt', async () => {
    const { dek_wrapped: wA, dek_salt: sA } = await provisionDek('cust-A')
    const { dek_salt: sB } = await provisionDek('cust-B') // different salt
    const dekCorrect = await deriveDek(wA, sA, 'cust-A')
    const dekWrongSalt = await deriveDek(wA, sB, 'cust-A') // same wrapped, wrong salt
    try {
      const ct = aesEncrypt(dekCorrect, 'secret-data')
      assert.throws(
        () => aesDecrypt(dekWrongSalt, ct),
        /Unsupported state or unable to authenticate data/,
        'Wrong salt must produce AEAD auth error',
      )
    } finally {
      dekCorrect.fill(0)
      dekWrongSalt.fill(0)
    }
  })

  test('mixed inputs (wrapped_A, salt_B, id_A) cannot decrypt ciphertext from (wrapped_A, salt_A, id_A)', async () => {
    const { dek_wrapped: wA, dek_salt: sA } = await provisionDek('cust-A')
    const { dek_salt: sB } = await provisionDek('cust-B')
    const dekCorrect = await deriveDek(wA, sA, 'cust-A')
    const dekMixed = await deriveDek(wA, sB, 'cust-A')
    try {
      const ct = aesEncrypt(dekCorrect, 'secret-data')
      assert.throws(
        () => aesDecrypt(dekMixed, ct),
        /Unsupported state or unable to authenticate data/,
        'Mixed-salt derivation must fail to decrypt',
      )
    } finally {
      dekCorrect.fill(0)
      dekMixed.fill(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Describe: getDek cache
// ---------------------------------------------------------------------------
describe('getDek LRU cache', () => {
  beforeEach(() => {
    setKmsAdapter(new LocalKmsStub())
    customersDb._clear()
  })
  afterEach(() => {
    customersDb._clear()
    setKmsAdapter(null)
  })

  test('second call within TTL returns same Buffer reference', async () => {
    const row = await customersDb.create({ email: 'cache-test@example.com' })
    const dek1 = await getDek(row.id)
    const dek2 = await getDek(row.id)
    assert.equal(dek1, dek2, 'Cache hit must return same Buffer reference')
  })

  test('invalidateDek causes re-derivation on next call', async () => {
    const row = await customersDb.create({ email: 'invalidate@example.com' })
    const dek1 = await getDek(row.id)
    // Copy the value before invalidation (dispose() will zero dek1 in place)
    const dek1Copy = Buffer.from(dek1)
    invalidateDek(row.id)
    // After invalidation dek1 should be zeroed (dispose was called)
    assert.deepEqual(dek1, Buffer.alloc(32), 'dispose() must have zeroed dek1 after invalidation')
    const dek2 = await getDek(row.id)
    // Different object reference
    assert.notEqual(dek1, dek2, 'Post-invalidation must return a new Buffer object')
    // Values must be cryptographically identical (same IKM + salt + customerId)
    assert.deepEqual(dek2, dek1Copy, 'Re-derived DEK must be cryptographically identical')
    dek2.fill(0)
  })

  test('getDek throws for unknown customer', async () => {
    await assert.rejects(
      () => getDek('nonexistent-id'),
      /unknown customer/,
    )
  })
})

// ---------------------------------------------------------------------------
// Describe: KmsAdapter swap
// ---------------------------------------------------------------------------
describe('KmsAdapter swap', () => {
  afterEach(() => setKmsAdapter(null))

  test('LocalKmsStub round-trips provision → derive consistently', async () => {
    setKmsAdapter(new LocalKmsStub())
    const { dek_wrapped, dek_salt } = await provisionDek('swap-test')
    const dek1 = await deriveDek(dek_wrapped, dek_salt, 'swap-test')
    const dek2 = await deriveDek(dek_wrapped, dek_salt, 'swap-test')
    try {
      assert.deepEqual(dek1, dek2, 'HKDF must be deterministic for same inputs')
      assert.equal(dek1.length, 32)
    } finally {
      dek1.fill(0)
      dek2.fill(0)
    }
  })

  test('in-memory mock KmsAdapter produces valid DEKs', async () => {
    // Minimal mock that wraps via simple XOR — just verifies the interface contract
    const fixedKey = randomBytes(32)
    const mockAdapter: KmsAdapter = {
      async encrypt(plaintext: Buffer): Promise<Buffer> {
        return Buffer.from(plaintext.map((b, i) => b ^ (fixedKey[i % 32] ?? 0)))
      },
      async decrypt(wrapped: Buffer): Promise<Buffer> {
        return Buffer.from(wrapped.map((b, i) => b ^ (fixedKey[i % 32] ?? 0)))
      },
      async generateDataKey(): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
        const plaintext = randomBytes(32)
        const wrapped = Buffer.from(plaintext.map((b, i) => b ^ (fixedKey[i % 32] ?? 0)))
        return { plaintext, wrapped }
      },
    }

    setKmsAdapter(mockAdapter)
    const { dek_wrapped, dek_salt } = await provisionDek('mock-test')
    const dek = await deriveDek(dek_wrapped, dek_salt, 'mock-test')
    try {
      assert.equal(dek.length, 32)
    } finally {
      dek.fill(0)
    }
  })
})
