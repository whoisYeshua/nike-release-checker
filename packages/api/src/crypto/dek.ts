/**
 * DEK provisioning and derivation — Story 16.2
 *
 * Envelope encryption model:
 *   1. At customer creation: KMS generates a 32-byte IKM, wrapped by the master key.
 *      A random 32-byte salt is generated and stored alongside.
 *   2. At request time: unwrap IKM via KMS, run HKDF-SHA256 to produce a customer-
 *      specific DEK bound to (customerId + salt).
 *   3. The plaintext IKM and DEK are zeroed in memory after use (best-effort).
 *
 * The derived DEK is NEVER stored; re-derived on every cache miss.
 */

import { hkdfSync, randomBytes } from 'node:crypto'
import type { KmsAdapter } from './kms.ts'
import { LocalKmsStub } from './kms.local.ts'
import { AwsKmsAdapter } from './kms.aws.ts'

/** Domain-specific HKDF info prefix — changing this rotates all DEKs. */
const HKDF_INFO_PREFIX = Buffer.from('nike-bot-dek-v1:', 'utf8')

let _kmsOverride: KmsAdapter | null = null

/**
 * Override the KMS adapter — for testing only.
 */
export function setKmsAdapter(adapter: KmsAdapter | null): void {
  _kmsOverride = adapter
}

/**
 * Return the active KMS adapter.
 * - Tests: use `LocalKmsStub` (unless overridden)
 * - Production: use `AwsKmsAdapter`
 */
export function getKms(): KmsAdapter {
  if (_kmsOverride) return _kmsOverride
  if (process.env['NODE_ENV'] === 'test') return new LocalKmsStub()
  return new AwsKmsAdapter()
}

/**
 * Provision a new DEK for a freshly-created customer.
 *
 * @returns `dek_wrapped` — KMS-wrapped IKM (store in `customers.dek_wrapped`)
 *          `dek_salt`    — random 32-byte salt  (store in `customers.dek_salt`)
 *
 * The plaintext IKM is zeroed before returning.
 */
export async function provisionDek(
  _customerId: string,
): Promise<{ dek_wrapped: Buffer; dek_salt: Buffer }> {
  const kms = getKms()
  const dek_salt = randomBytes(32)
  const { plaintext: ikm, wrapped: dek_wrapped } = await kms.generateDataKey()
  try {
    return { dek_wrapped, dek_salt }
  } finally {
    ikm.fill(0)
  }
}

/**
 * Derive the DEK for a customer from their stored `dek_wrapped` + `dek_salt`.
 *
 * The returned Buffer is bound to this customer only.
 * CALLER MUST zero the returned buffer when done:  `dek.fill(0)`
 *
 * The plaintext IKM is zeroed inside this function before returning.
 */
export async function deriveDek(
  dek_wrapped: Buffer,
  dek_salt: Buffer,
  customerId: string,
): Promise<Buffer> {
  const kms = getKms()
  const ikm = await kms.decrypt(dek_wrapped)
  try {
    const info = Buffer.concat([HKDF_INFO_PREFIX, Buffer.from(customerId, 'utf8')])
    const dek = Buffer.from(hkdfSync('sha256', ikm, dek_salt, info, 32))
    return dek
  } finally {
    ikm.fill(0)
  }
}
