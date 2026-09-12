import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM + PBKDF2 primitives for at-rest encryption of payment card
 * data stored in the local SQLite DB.
 *
 * - PBKDF2: SHA-256, 100k iterations (OWASP 2024 minimum).
 * - AES-256-GCM: authenticated encryption; tampering is detected via authTag.
 * - IV: 12 bytes, freshly randomised per encryption (NEVER reuse with same key).
 *
 * The derived key is kept only in memory; never persist it to disk.
 */

const KDF_ITERATIONS = 100_000
const KEY_LEN = 32 // AES-256
const IV_LEN = 12 // GCM recommended IV size
const SALT_LEN = 16

export function deriveKey(passphrase: string, salt: Buffer): Buffer {
	return pbkdf2Sync(passphrase, salt, KDF_ITERATIONS, KEY_LEN, 'sha256')
}

export function encrypt(plaintext: string, key: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
	const iv = randomBytes(IV_LEN)
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
	const tag = cipher.getAuthTag()
	return { iv, tag, ct }
}

export function decrypt(ct: Buffer, iv: Buffer, tag: Buffer, key: Buffer): string {
	const decipher = createDecipheriv('aes-256-gcm', key, iv)
	decipher.setAuthTag(tag)
	const pt = Buffer.concat([decipher.update(ct), decipher.final()])
	return pt.toString('utf8')
}

export function newSalt(): Buffer {
	return randomBytes(SALT_LEN)
}
