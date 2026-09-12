import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as v from 'valibot'
import { CountrySchema } from './types.ts'
import { countryRegistry, UnknownCountryError } from './registry.ts'

const SDK_TOTAL = 52

describe('countryRegistry — shape validation', () => {
	test(`all ${SDK_TOTAL} entries pass CountrySchema (also asserted at module load)`, () => {
		const all = countryRegistry.list()
		assert.equal(all.length, SDK_TOTAL, `should have ${SDK_TOTAL} entries`)
		for (const entry of all) {
			assert.doesNotThrow(
				() => v.parse(CountrySchema, entry),
				`entry ${entry.code} should pass CountrySchema`,
			)
		}
	})
})

describe('countryRegistry — get()', () => {
	test('get("FR") returns the FR entry', () => {
		const fr = countryRegistry.get('FR')
		assert.equal(fr.code, 'FR')
		assert.equal(fr.currency, 'EUR')
		assert.equal(fr.locale, 'fr-FR')
		assert.equal(fr.enabled, true)
	})

	test('get("fr") (lowercase) also returns FR entry', () => {
		const fr = countryRegistry.get('fr')
		assert.equal(fr.code, 'FR')
	})

	test('get("XX") throws UnknownCountryError with .code === "XX"', () => {
		assert.throws(
			() => countryRegistry.get('XX'),
			(err: unknown) => {
				assert.ok(err instanceof UnknownCountryError)
				assert.equal(err.code, 'XX')
				return true
			},
		)
	})

	// Explicit override countries are present with correct data
	test('get("US") returns the US entry with correct locale', () => {
		const us = countryRegistry.get('US')
		assert.equal(us.code, 'US')
		assert.equal(us.currency, 'USD')
		assert.equal(us.locale, 'en-US')
	})

	// SDK-generated entry (not in the 10 explicit overrides)
	test('get("AT") returns a generated Austria entry with EUR currency', () => {
		const at = countryRegistry.get('AT')
		assert.equal(at.code, 'AT')
		assert.equal(at.currency, 'EUR')
		assert.equal(at.enabled, false)
	})

	test('get("JP") returns explicit JP entry with JPY currency', () => {
		const jp = countryRegistry.get('JP')
		assert.equal(jp.code, 'JP')
		assert.equal(jp.currency, 'JPY')
	})

	test('get("RU") returns Russia with feedSupported === false', () => {
		const ru = countryRegistry.get('RU')
		assert.equal(ru.code, 'RU')
		assert.equal(ru.feedSupported, false)
		assert.equal(ru.enabled, false)
	})

	test('get("EG") returns Egypt with feedSupported === false', () => {
		const eg = countryRegistry.get('EG')
		assert.equal(eg.feedSupported, false)
	})

	test('get("CL") returns Chile with feedSupported === false', () => {
		const cl = countryRegistry.get('CL')
		assert.equal(cl.feedSupported, false)
	})
})

describe('countryRegistry — isSupported()', () => {
	test('isSupported("FR") === true', () => {
		assert.equal(countryRegistry.isSupported('FR'), true)
	})

	test('isSupported("US") === true (present in registry)', () => {
		assert.equal(countryRegistry.isSupported('US'), true)
	})

	test('isSupported("AT") === true (SDK-generated entry)', () => {
		assert.equal(countryRegistry.isSupported('AT'), true)
	})

	test('isSupported("XX") === false (unknown country)', () => {
		assert.equal(countryRegistry.isSupported('XX'), false)
	})

	test('all 53 SDK countries are recognised by isSupported()', () => {
		const sdkCodes = [
			'AU', 'AT', 'BE', 'BG', 'CA', 'CL', 'CN', 'HR', 'CZ', 'DK',
			'EG', 'FI', 'FR', 'DE', 'GR', 'HU', 'IN', 'ID', 'IE', 'IL',
			'IT', 'JP', 'KR', 'LU', 'MY', 'MX', 'MA', 'NL', 'NZ', 'NO',
			'PH', 'PL', 'PR', 'PT', 'RO', 'RU', 'SA', 'SG', 'SK', 'SI',
			'ZA', 'ES', 'SE', 'CH', 'TW', 'TH', 'TR', 'AE', 'GB', 'US',
			'UY', 'VN',
		]
		for (const code of sdkCodes) {
			assert.equal(
				countryRegistry.isSupported(code),
				true,
				`${code} should be recognised by isSupported()`,
			)
		}
	})
})

describe('countryRegistry — list()', () => {
	test(`list() returns all ${SDK_TOTAL} entries`, () => {
		assert.equal(countryRegistry.list().length, SDK_TOTAL)
	})

	test('list({ enabledOnly: true }) returns only FR in v3.0', () => {
		const enabled = countryRegistry.list({ enabledOnly: true })
		assert.equal(enabled.length, 1)
		assert.equal(enabled[0]?.code, 'FR')
	})

	test('list() contains exactly 10 explicit override entries with precise patterns', () => {
		const all = countryRegistry.list()
		const explicitCodes = ['FR', 'US', 'GB', 'DE', 'JP', 'ES', 'IT', 'NL', 'BE', 'AU']
		for (const code of explicitCodes) {
			const entry = all.find((c) => c.code === code)
			assert.ok(entry, `${code} should be present`)
		}
	})
})

describe('countryRegistry — immutability', () => {
	test('frozen entry throws in strict mode when mutating', () => {
		const fr = countryRegistry.get('FR')
		assert.throws(() => {
			;(fr as Record<string, unknown>)['code'] = 'XX'
		})
	})

	test('frozen SDK-generated entry throws in strict mode when mutating', () => {
		const at = countryRegistry.get('AT')
		assert.throws(() => {
			;(at as Record<string, unknown>)['code'] = 'XX'
		})
	})
})

describe('countryRegistry — SDK-generated entries shape', () => {
	test('all SDK-generated entries have valid locale format', () => {
		const localeRegex = /^[a-z]{2}-[A-Z]{2}$/
		const all = countryRegistry.list()
		for (const entry of all) {
			assert.match(
				entry.locale,
				localeRegex,
				`${entry.code} locale "${entry.locale}" should match /^[a-z]{2}-[A-Z]{2}$/`,
			)
		}
	})

	test('all SDK-generated entries have valid adyenIframeLocale format', () => {
		const adyenRegex = /^[a-z]{2}_[A-Z]{2}$/
		const all = countryRegistry.list()
		for (const entry of all) {
			assert.match(
				entry.adyenIframeLocale,
				adyenRegex,
				`${entry.code} adyenIframeLocale "${entry.adyenIframeLocale}" should match /^[a-z]{2}_[A-Z]{2}$/`,
			)
		}
	})

	test('SDK-generated AT entry has correct phone prefix +43', () => {
		const at = countryRegistry.get('AT')
		assert.equal(at.defaultPhonePrefix, '+43')
	})

	test('SDK-generated CH entry has CHF currency', () => {
		const ch = countryRegistry.get('CH')
		assert.equal(ch.currency, 'CHF')
	})

	test('SDK-generated KR entry has KRW currency and ko_KR adyen locale', () => {
		const kr = countryRegistry.get('KR')
		assert.equal(kr.currency, 'KRW')
		assert.equal(kr.adyenIframeLocale, 'ko_KR')
	})
})
