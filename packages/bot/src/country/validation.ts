// Per-country phone and zip validation.
// Two layers: validatePhone/validateZip for imperative checks, phoneSchema/zipSchema for
// valibot-based declarative schemas (CSV parsing, payload guards).
// Story 13.3, FR59, NFR34.

import * as v from 'valibot'
import { countryRegistry } from './registry.ts'
import { PHONE_HINTS, ZIP_HINTS } from './validationHints.ts'

// Re-export so callers only need to import from validation.ts
export { UnknownCountryError } from './registry.ts'

// ─── Result type ─────────────────────────────────────────────────────────────

export type ValidationResult =
	| { ok: true }
	| { ok: false; field: 'phone' | 'zip'; country: string; value: string; expected: string }

// ─── Imperative validators ────────────────────────────────────────────────────

/**
 * Validate a phone number for the given country code.
 * Empty string is treated as "not provided" → ok: true (phone is optional).
 * Throws UnknownCountryError if the country code is not in the registry.
 */
export function validatePhone(countryCode: string, value: string): ValidationResult {
	if (value === '') return { ok: true }
	const country = countryRegistry.get(countryCode)
	if (country.phonePattern.test(value)) return { ok: true }
	return {
		ok: false,
		field: 'phone',
		country: country.code,
		value,
		expected: PHONE_HINTS[country.code] ?? `valid phone for ${country.code}`,
	}
}

/**
 * Validate a ZIP/postal code for the given country code.
 * Empty string is always rejected (zip is required).
 * Throws UnknownCountryError if the country code is not in the registry.
 */
export function validateZip(countryCode: string, value: string): ValidationResult {
	const country = countryRegistry.get(countryCode)
	if (value !== '' && country.zipPattern.test(value)) return { ok: true }
	return {
		ok: false,
		field: 'zip',
		country: country.code,
		value,
		expected: ZIP_HINTS[country.code] ?? `valid ZIP for ${country.code}`,
	}
}

// ─── Valibot schema factories ─────────────────────────────────────────────────

/**
 * Returns a valibot schema that accepts an empty string (phone optional)
 * or a phone matching the country's phonePattern.
 */
export function phoneSchema(countryCode: string): v.GenericSchema<string> {
	const country = countryRegistry.get(countryCode)
	const hint = PHONE_HINTS[country.code] ?? `valid phone for ${country.code}`
	return v.union([
		v.literal(''),
		v.pipe(v.string(), v.regex(country.phonePattern, hint)),
	]) as unknown as v.GenericSchema<string>
}

/**
 * Returns a valibot schema that accepts only non-empty strings matching the
 * country's zipPattern (zip is required).
 */
export function zipSchema(countryCode: string): v.GenericSchema<string> {
	const country = countryRegistry.get(countryCode)
	const hint = ZIP_HINTS[country.code] ?? `valid ZIP for ${country.code}`
	return v.pipe(v.string(), v.regex(country.zipPattern, hint)) as unknown as v.GenericSchema<string>
}
