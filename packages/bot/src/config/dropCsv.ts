import { readCsvRows, type CsvIssue } from './csvRead.ts'
import { countryRegistry } from '../country/registry.ts'
import { normalizeCountryCode } from '../country/normalize.ts'

export type AccountsFilter =
	| { kind: 'all' }
	| { kind: 'explicit'; ids: string[] }

export type Drop = {
	sku: string
	sizes: string[]
	accountsFilter: AccountsFilter
	country: string // always populated post-parse — defaults already applied
	name?: string // optional human-friendly pair name (display only)
}

/**
 * @deprecated Use Drop instead. Kept for backward compat with callers that
 * still use `accounts_filter` (snake_case). Will be removed in next major.
 */
export type DropRow = {
	sku: string
	sizes: string[]
	accounts_filter: AccountsFilter
	country: string
}

export type DropParseResult = {
	drops: Drop[]
	errors: CsvIssue[]
	warnings: CsvIssue[]
}

const SKU_RE = /^[A-Z0-9]{2,6}-?\d{3,4}$/ // tolerant — Nike formats vary

export async function parseDropCsv(
	filePath: string,
	knownAccountIds: Set<string>,
	defaultCountry = 'FR',
): Promise<DropParseResult> {
	const { rows, parseErrors, rowToSourceLine } = await readCsvRows(filePath)
	const drops: Drop[] = []
	const errors: CsvIssue[] = [...parseErrors]
	const warnings: CsvIssue[] = []
	const seenSkus = new Set<string>()

	rows.forEach((raw, idx) => {
		const rowNum = rowToSourceLine[idx] ?? idx + 2
		// The sku column accepts EITHER a Nike styleColor (e.g. IQ7604-101) OR a
		// full product URL (e.g. https://www.nike.com/fr/t/.../IQ7604-101). A URL is
		// kept verbatim (no upper-casing) and used directly at run time, skipping
		// feed resolution.
		const skuRaw = (raw.sku ?? '').trim()
		const isUrl = /^https?:\/\//i.test(skuRaw)
		const sku = isUrl ? skuRaw : skuRaw.toUpperCase()
		const sizesRaw = raw.sizes ?? ''
		// Accept both ';' and ',' as size separators. Note: a comma only reaches
		// here if the sizes cell was quoted in the CSV (e.g. "42,42.5"); an
		// unquoted comma would be a column break. Both separators are supported so
		// users aren't tripped up by which one they used.
		const sizes = sizesRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
		const filterRaw = (raw.accounts_filter ?? '').trim()
		const countryRaw = (raw.country ?? '').trim()
		// Optional display-only pair name (column "name"); never affects matching.
		const name = (raw.name ?? '').trim() || undefined

		if (!sku) {
			errors.push({
				row: rowNum,
				column: 'sku',
				value: sku,
				message: 'sku required',
			})
			return
		}
		if (!isUrl && !SKU_RE.test(sku)) {
			warnings.push({
				row: rowNum,
				column: 'sku',
				value: sku,
				message: 'non-standard SKU format (expected AH7389-106 style, or a full product URL)',
			})
		}
		if (sizes.length === 0) {
			errors.push({
				row: rowNum,
				column: 'sizes',
				value: sizesRaw,
				message: 'at least one size required (use ";" separator)',
			})
			return
		}

		let accountsFilter: AccountsFilter
		if (filterRaw === 'all' || filterRaw === '') {
			accountsFilter = { kind: 'all' }
		} else {
			const ids = filterRaw.split(';').map((s) => s.trim()).filter(Boolean)
			const unknown = ids.filter((id) => !knownAccountIds.has(id))
			if (unknown.length > 0) {
				errors.push({
					row: rowNum,
					column: 'accounts_filter',
					value: unknown.join(','),
					message: `unknown account_ids: ${unknown.join(', ')}`,
				})
				return
			}
			accountsFilter = { kind: 'explicit', ids }
		}

		// Country resolution
		const rawInput = countryRaw === '' ? defaultCountry : countryRaw
		const normalized = normalizeCountryCode(rawInput)

		// Lookup in registry — distinguish disabled vs unknown
		const entry = (() => {
			try {
				return countryRegistry.get(normalized)
			} catch {
				return undefined
			}
		})()

		if (entry === undefined) {
			errors.push({
				row: rowNum,
				column: 'country',
				value: normalized,
				message: `row ${rowNum}: unknown country code \`${normalized}\` (see \`nike-bot countries\` for supported list)`,
			})
			return
		}
		if (!entry.enabled) {
			errors.push({
				row: rowNum,
				column: 'country',
				value: normalized,
				message: `row ${rowNum}: country \`${normalized}\` is in registry but disabled in v3.0 (enable it via Story 13.x)`,
			})
			return
		}

		if (seenSkus.has(sku)) {
			warnings.push({
				row: rowNum,
				column: 'sku',
				value: sku,
				message: 'duplicate SKU — multiple drop rows for same SKU (intentional?)',
			})
		}
		seenSkus.add(sku)
		drops.push({ sku, sizes, accountsFilter, country: normalized, ...(name ? { name } : {}) })
	})

	return { drops, errors, warnings }
}

// Runtime resolution — called at drop time, not parse time
export function resolveAccountsFilter(
	filter: AccountsFilter,
	allAccountIds: string[],
	validSessionIds: Set<string>,
	dropCountry?: string,
	accountCountries?: Map<string, string>,
): string[] {
	if (filter.kind === 'all') {
		return allAccountIds.filter((id) => {
			if (!validSessionIds.has(id)) return false
			// Country-scoped: when accounts_filter=all, only include accounts matching drop country
			if (dropCountry !== undefined && accountCountries !== undefined) {
				return accountCountries.get(id) === dropCountry
			}
			return true
		})
	}
	return filter.ids.filter((id) => validSessionIds.has(id))
}
