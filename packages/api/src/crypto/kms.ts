/**
 * KMS adapter interface — Story 16.2
 *
 * Abstraction over cloud KMS providers (AWS KMS, GCP Cloud KMS, etc.)
 * and the local deterministic stub used in tests.
 *
 * The master key is never materialised in application memory; the adapter
 * communicates with the HSM and returns/accepts opaque wrapped blobs.
 */

export interface KmsAdapter {
  /**
   * Encrypt `plaintext` with the master KMS key.
   * Returns the opaque wrapped blob (ciphertext).
   */
  encrypt(plaintext: Buffer): Promise<Buffer>

  /**
   * Decrypt a wrapped blob produced by `encrypt`.
   * Returns the original plaintext Buffer.
   *
   * CALLER MUST zero the returned Buffer when done:  `buf.fill(0)`
   */
  decrypt(wrapped: Buffer): Promise<Buffer>

  /**
   * Generate a 32-byte CSPRNG data key, wrap it with the master KMS key,
   * and return both the plaintext and the wrapped form.
   *
   * CALLER MUST zero `plaintext` when done:  `plaintext.fill(0)`
   */
  generateDataKey(): Promise<{ plaintext: Buffer; wrapped: Buffer }>
}
