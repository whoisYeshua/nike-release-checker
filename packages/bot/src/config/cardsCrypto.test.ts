import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKey, encrypt, decrypt, newSalt } from './cardsCrypto.ts'

test('encrypt/decrypt round-trip returns the original plaintext', () => {
	const salt = newSalt()
	const key = deriveKey('correct horse battery staple', salt)
	const plaintext = '4111111111111111'
	const { iv, tag, ct } = encrypt(plaintext, key)
	assert.equal(iv.length, 12)
	assert.equal(tag.length, 16)
	assert.notEqual(ct.toString('utf8'), plaintext)
	const decoded = decrypt(ct, iv, tag, key)
	assert.equal(decoded, plaintext)
})

test('tampering with ciphertext causes decrypt to throw (authTag verified)', () => {
	const salt = newSalt()
	const key = deriveKey('pass', salt)
	const { iv, tag, ct } = encrypt('sensitive', key)
	// Flip a byte in the ciphertext
	const tampered = Buffer.from(ct)
	tampered[0] = tampered[0] ^ 0xff
	assert.throws(() => decrypt(tampered, iv, tag, key))
})

test('tampering with authTag causes decrypt to throw', () => {
	const salt = newSalt()
	const key = deriveKey('pass', salt)
	const { iv, tag, ct } = encrypt('sensitive', key)
	const tamperedTag = Buffer.from(tag)
	tamperedTag[0] = tamperedTag[0] ^ 0xff
	assert.throws(() => decrypt(ct, iv, tamperedTag, key))
})

test('PBKDF2 is deterministic: same passphrase + salt yield same key', () => {
	const salt = newSalt()
	const k1 = deriveKey('hunter2', salt)
	const k2 = deriveKey('hunter2', salt)
	assert.ok(k1.equals(k2))
	assert.equal(k1.length, 32)
})

test('different passphrases produce different keys', () => {
	const salt = newSalt()
	const k1 = deriveKey('passA', salt)
	const k2 = deriveKey('passB', salt)
	assert.ok(!k1.equals(k2))
})

test('each encryption uses a fresh IV', () => {
	const key = deriveKey('p', newSalt())
	const a = encrypt('same-plaintext', key)
	const b = encrypt('same-plaintext', key)
	assert.ok(!a.iv.equals(b.iv), 'IVs must differ across encryptions')
	assert.ok(!a.ct.equals(b.ct), 'ciphertexts must differ with different IVs')
})
