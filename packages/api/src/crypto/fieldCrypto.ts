/**
 * Per-field AES-256-GCM encryption primitives — Story 16.3
 *
 * Wire format (BYTEA): iv (12 bytes) || ciphertext (variable) || tag (16 bytes)
 * A fresh IV is generated per field per encrypt call.
 * IV reuse with the same key is catastrophic for GCM — unit-tested explicitly.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const IV_LEN = 12
const TAG_LEN = 16

/**
 * Encrypt a UTF-8 plaintext string with AES-256-GCM.
 * Returns a Buffer containing: iv || ciphertext || tag
 */
export function encryptField(plaintext: string, dek: Buffer): Buffer {
  if (dek.length !== 32) throw new Error('dek must be 32 bytes')
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', dek, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, enc, tag])
}

/**
 * Decrypt a Buffer produced by `encryptField`.
 * Throws if the auth-tag doesn't match (tampered or wrong key).
 */
export function decryptField(blob: Buffer, dek: Buffer): string {
  if (dek.length !== 32) throw new Error('dek must be 32 bytes')
  const iv = blob.subarray(0, IV_LEN)
  const tag = blob.subarray(blob.length - TAG_LEN)
  const ct = blob.subarray(IV_LEN, blob.length - TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', dek, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
