import * as v from 'valibot'
import { availableCountries } from '@nike-release-checker/sdk'
import { CountrySchema, UnknownCountryError } from './types.ts'
import type { Country } from './types.ts'
import { defaultCountryFromSdk } from './sdkFactory.ts'
import { FR } from './entries/fr.ts'
import { US } from './entries/us.ts'
import { GB } from './entries/gb.ts'
import { DE } from './entries/de.ts'
import { JP } from './entries/jp.ts'
import { ES } from './entries/es.ts'
import { IT } from './entries/it.ts'
import { NL } from './entries/nl.ts'
import { BE } from './entries/be.ts'
import { AU } from './entries/au.ts'

// Explicit overrides: 10 hand-tuned entries with validated phone/zip patterns.
// These take precedence over the SDK-generated defaults.
const EXPLICIT_ENTRIES: ReadonlyArray<Country> = Object.freeze([
	FR, US, GB, DE, JP, ES, IT, NL, BE, AU,
])

const EXPLICIT_CODES = new Set(EXPLICIT_ENTRIES.map((c) => c.code))

// Generate entries for all 43 remaining SDK countries
const SDK_GENERATED: Country[] = availableCountries
	.filter((sdkEntry) => !EXPLICIT_CODES.has(sdkEntry.code))
	.map(defaultCountryFromSdk)

const ALL_ENTRIES: ReadonlyArray<Country> = Object.freeze([
	...EXPLICIT_ENTRIES,
	...SDK_GENERATED,
])

// Validate every entry at module load — fail fast on shape drift
for (const entry of ALL_ENTRIES) v.parse(CountrySchema, entry)

const BY_CODE = new Map(ALL_ENTRIES.map((c) => [c.code, c]))

export const countryRegistry = {
	get(code: string): Country {
		const entry = BY_CODE.get(code.toUpperCase())
		if (!entry) throw new UnknownCountryError(code)
		return entry
	},
	list(opts?: { enabledOnly?: boolean }): Country[] {
		return opts?.enabledOnly === true
			? ALL_ENTRIES.filter((c) => c.enabled)
			: [...ALL_ENTRIES]
	},
	isSupported(code: string): boolean {
		return BY_CODE.has(code.toUpperCase())
	},
}

export { UnknownCountryError } from './types.ts'
export type { Country } from './types.ts'
