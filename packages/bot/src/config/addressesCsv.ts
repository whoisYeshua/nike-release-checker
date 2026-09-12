import * as v from 'valibot'
import { readCsvRows, type CsvIssue } from './csvRead.ts'
import { countryRegistry, UnknownCountryError } from '../country/registry.ts'
import { phoneSchema, zipSchema } from '../country/validation.ts'

// Treat empty/missing CSV cells as "not provided" so `v.optional` can apply.
const OptionalCsvString = v.pipe(
	v.unknown(),
	v.transform((val) => {
		if (val === undefined || val === null) return undefined
		const s = String(val).trim()
		return s === '' ? undefined : s
	}),
)

export const AddressRowSchema = v.object({
	account_id: v.pipe(v.string(), v.minLength(1, 'account_id required')),
	// Nike checkout requires first/last name + email — added as optional in the
	// schema so legacy CSVs (street/city/zip/country/phone only) still parse,
	// but consumers (cartViewsApi.openShippingView) will fail-fast at runtime
	// if absent. New CSVs should populate them.
	firstName: v.optional(
		v.pipe(OptionalCsvString, v.union([v.undefined(), v.string()])),
	),
	lastName: v.optional(
		v.pipe(OptionalCsvString, v.union([v.undefined(), v.string()])),
	),
	email: v.optional(
		v.pipe(OptionalCsvString, v.union([v.undefined(), v.string()])),
	),
	street: v.pipe(v.string(), v.minLength(1, 'street required')),
	city: v.pipe(v.string(), v.minLength(1, 'city required')),
	zip: v.pipe(v.string(), v.minLength(1, 'zip required')),
	country: v.pipe(v.string(), v.length(2, 'country must be a 2-letter ISO code')),
	phone: v.optional(
		v.pipe(OptionalCsvString, v.union([v.undefined(), v.string()])),
	),
})

/** Build a country-aware address row schema for per-row validation. */
function buildCountryAwareSchema(countryCode: string) {
	return v.object({
		account_id: v.pipe(v.string(), v.minLength(1, 'account_id required')),
		firstName: v.optional(
			v.pipe(OptionalCsvString, v.union([v.undefined(), v.string()])),
		),
		lastName: v.optional(
			v.pipe(OptionalCsvString, v.union([v.undefined(), v.string()])),
		),
		email: v.optional(
			v.pipe(OptionalCsvString, v.union([v.undefined(), v.string()])),
		),
		street: v.pipe(v.string(), v.minLength(1, 'street required')),
		city: v.pipe(v.string(), v.minLength(1, 'city required')),
		zip: zipSchema(countryCode),
		country: v.pipe(v.string(), v.length(2, 'country must be a 2-letter ISO code')),
		phone: v.optional(phoneSchema(countryCode)),
	})
}

export type AddressRow = v.InferOutput<typeof AddressRowSchema>

export type AddressParseResult = {
	byAccountId: Map<string, AddressRow>
	errors: CsvIssue[]
	warnings: CsvIssue[]
}

export async function parseAddressesCsv(
	filePath: string,
	knownAccountIds: Set<string>,
	accountCountries: Map<string, string>,
): Promise<AddressParseResult> {
	const { rows, parseErrors, rowToSourceLine } = await readCsvRows(filePath)
	const byAccountId = new Map<string, AddressRow>()
	const errors: CsvIssue[] = [...parseErrors]
	const warnings: CsvIssue[] = []

	rows.forEach((row, idx) => {
		const rowNum = rowToSourceLine[idx] ?? idx + 2

		// First pass: validate base shape (account_id, street, city, country)
		const baseResult = v.safeParse(AddressRowSchema, row)
		if (!baseResult.success) {
			for (const issue of baseResult.issues) {
				const column = String(issue.path?.[0]?.key ?? 'unknown')
				const rawValue = String(row[column] ?? '')
				errors.push({
					row: rowNum,
					column,
					value: rawValue,
					message: issue.message,
				})
			}
			return
		}

		// Second pass: country-aware phone + zip validation
		const rawCountry = String(row['country'] ?? '').trim().toUpperCase()
		let isCountrySupported = false
		try {
			countryRegistry.get(rawCountry)
			isCountrySupported = true
		} catch (err) {
			if (err instanceof UnknownCountryError) {
				errors.push({
					row: rowNum,
					column: 'country',
					value: rawCountry,
					message: `country \`${rawCountry}\` not supported (see \`nike-bot countries\` for list)`,
				})
				return
			}
			throw err
		}

		if (isCountrySupported) {
			const countryAwareResult = v.safeParse(buildCountryAwareSchema(rawCountry), row)
			if (!countryAwareResult.success) {
				for (const issue of countryAwareResult.issues) {
					const column = String(issue.path?.[0]?.key ?? 'unknown')
					const rawValue = String(row[column] ?? '')
					errors.push({
						row: rowNum,
						column,
						value: rawValue,
						message: issue.message,
					})
				}
				return
			}
		}

		const addr = baseResult.output
		if (!knownAccountIds.has(addr.account_id)) {
			warnings.push({
				row: rowNum,
				column: 'account_id',
				value: addr.account_id,
				message: 'orphan — no such account in accounts.csv',
			})
			return
		}
		const accCountry = accountCountries.get(addr.account_id)
		if (accCountry && accCountry !== addr.country) {
			warnings.push({
				row: rowNum,
				column: 'country',
				value: addr.country,
				message: `country mismatch (account is ${accCountry}, address is ${addr.country})`,
			})
		}
		byAccountId.set(addr.account_id, addr)
	})

	// Accounts missing an address row
	for (const id of knownAccountIds) {
		if (!byAccountId.has(id)) {
			warnings.push({
				row: 0,
				column: 'account_id',
				value: id,
				message: 'account has no shipping address — Nike profile fallback required',
			})
		}
	}

	return { byAccountId, errors, warnings }
}
