/**
 * LocalKmsStub — Story 16.2
 *
 * Deterministic, offline KMS adapter for unit/integration tests.
 * Uses AES-256-GCM with a fixed 32-byte key derived from a well-known
 * constant so that tests are reproducible and fully offline (no cloud creds).
 *
 * NEVER use in production.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { KmsAdapter } from './kms.ts'

/** Fixed local master key (32 bytes).  Tests only. */
const LOCAL_MASTER_KEY = Buffer.from(
  '6c6f63616c2d6b6d732d6b65792d666f722d74657374696e672d6f6e6c792121',
  'hex',
) // 32 bytes

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function localEncrypt(plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, LOCAL_MASTER_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  // layout: [iv (12)] [tag (16)] [ciphertext]
  return Buffer.concat([iv, tag, encrypted])
}

function localDecrypt(wrapped: Buffer): Buffer {
  const iv = wrapped.subarray(0, IV_LENGTH)
  const tag = wrapped.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = wrapped.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, LOCAL_MASTER_KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export class LocalKmsStub implements KmsAdapter {
  async encrypt(plaintext: Buffer): Promise<Buffer> {
    return localEncrypt(plaintext)
  }

  async decrypt(wrapped: Buffer): Promise<Buffer> {
    return localDecrypt(wrapped)
  }

  async generateDataKey(): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
    const plaintext = randomBytes(32)
    const wrapped = localEncrypt(plaintext)
    return { plaintext, wrapped }
  }
}
