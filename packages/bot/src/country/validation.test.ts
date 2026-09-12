import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validatePhone, validateZip, phoneSchema, zipSchema, UnknownCountryError } from './validation.ts'
import { PHONE_HINTS, ZIP_HINTS } from './validationHints.ts'
import { VALIDATION_CASES } from './__fixtures__/validationCases.ts'
import * as v from 'valibot'

// ─── Loop assertions: phone ───────────────────────────────────────────────────

describe('validatePhone — valid samples', () => {
	for (const [cc, cases] of Object.entries(VALIDATION_CASES)) {
		for (const sample of cases.phone.valid) {
			test(`${cc}: validatePhone("${sample}") → ok`, () => {
				const result = validatePhone(cc, sample)
				assert.equal(result.ok, true, `Expected ok for ${cc} phone "${sample}"`)
			})
		}
	}
})

describe('validatePhone — invalid samples', () => {
	for (const [cc, cases] of Object.entries(VALIDATION_CASES)) {
		for (const sample of cases.phone.invalid) {
			test(`${cc}: validatePhone("${sample}") → error with expected hint`, () => {
				const result = validatePhone(cc, sample)
				assert.equal(result.ok, false, `Expected error for ${cc} phone "${sample}"`)
				if (!result.ok) {
					assert.equal(result.field, 'phone')
					assert.equal(result.country, cc)
					assert.equal(result.value, sample)
					assert.equal(result.expected, PHONE_HINTS[cc])
				}
			})
		}
	}
})

// ─── Loop assertions: zip ─────────────────────────────────────────────────────

describe('validateZip — valid samples', () => {
	for (const [cc, cases] of Object.entries(VALIDATION_CASES)) {
		for (const sample of cases.zip.valid) {
			test(`${cc}: validateZip("${sample}") → ok`, () => {
				const result = validateZip(cc, sample)
				assert.equal(result.ok, true, `Expected ok for ${cc} zip "${sample}"`)
			})
		}
	}
})

describe('validateZip — invalid samples', () => {
	for (const [cc, cases] of Object.entries(VALIDATION_CASES)) {
		for (const sample of cases.zip.invalid) {
			test(`${cc}: validateZip("${sample}") → error with expected hint`, () => {
				const result = validateZip(cc, sample)
				assert.equal(result.ok, false, `Expected error for ${cc} zip "${sample}"`)
				if (!result.ok) {
					assert.equal(result.field, 'zip')
					assert.equal(result.country, cc)
					assert.equal(result.value, sample)
					assert.equal(result.expected, ZIP_HINTS[cc])
				}
			})
		}
	}
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('validatePhone — edge cases', () => {
	test('empty string → ok: true (phone is optional)', () => {
		const result = validatePhone('FR', '')
		assert.equal(result.ok, true)
	})

	test('unknown country code throws UnknownCountryError', () => {
		assert.throws(
			() => validatePhone('XX', '+33612345678'),
			(err: unknown) => {
				assert.ok(err instanceof UnknownCountryError)
				return true
			},
		)
	})

	test('lowercase country code is accepted (normalized by registry)', () => {
		const result = validatePhone('fr', '+33612345678')
		assert.equal(result.ok, true)
	})
})

describe('validateZip — edge cases', () => {
	test('empty string → ok: false (zip is required)', () => {
		const result = validateZip('FR', '')
		assert.equal(result.ok, false)
		if (!result.ok) {
			assert.equal(result.field, 'zip')
			assert.equal(result.value, '')
		}
	})

	test('unknown country code throws UnknownCountryError', () => {
		assert.throws(
			() => validateZip('XX', '75001'),
			(err: unknown) => {
				assert.ok(err instanceof UnknownCountryError)
				return true
			},
		)
	})
})

// ─── Valibot schema factories ─────────────────────────────────────────────────

describe('phoneSchema()', () => {
	test('FR phone schema accepts valid phone', () => {
		const schema = phoneSchema('FR')
		assert.doesNotThrow(() => v.parse(schema, '+33612345678'))
	})

	test('FR phone schema accepts empty string (optional)', () => {
		const schema = phoneSchema('FR')
		assert.doesNotThrow(() => v.parse(schema, ''))
	})

	test('FR phone schema rejects invalid phone', () => {
		const schema = phoneSchema('FR')
		assert.throws(() => v.parse(schema, '0612345678'))
	})

	test('unknown country code throws UnknownCountryError during schema creation', () => {
		assert.throws(
			() => phoneSchema('XX'),
			(err: unknown) => {
				assert.ok(err instanceof UnknownCountryError)
				return true
			},
		)
	})
})

describe('zipSchema()', () => {
	test('FR zip schema accepts valid zip', () => {
		const schema = zipSchema('FR')
		assert.doesNotThrow(() => v.parse(schema, '75001'))
	})

	test('FR zip schema rejects empty string (required)', () => {
		const schema = zipSchema('FR')
		assert.throws(() => v.parse(schema, ''))
	})

	test('FR zip schema rejects invalid zip', () => {
		const schema = zipSchema('FR')
		assert.throws(() => v.parse(schema, '7500'))
	})

	test('unknown country code throws UnknownCountryError during schema creation', () => {
		assert.throws(
			() => zipSchema('XX'),
			(err: unknown) => {
				assert.ok(err instanceof UnknownCountryError)
				return true
			},
		)
	})
})
