import * as v from 'valibot'
import { readCsvRows, type CsvIssue } from './csvRead.ts'
import { normalizeProxyInput } from './proxyNormalize.ts'

// Treat empty/missing CSV cells as "not provided" so `v.optional` can apply defaults.
const OptionalCsvString = v.pipe(
	v.unknown(),
	v.transform((val) => {
		if (val === undefined || val === null) return undefined
		const s = String(val).trim()
		return s === '' ? undefined : s
	}),
)

export const AccountCsvRowSchema = v.object({
	account_id: v.pipe(
		v.string(),
		v.regex(/^[a-zA-Z0-9_-]+$/, 'account_id must be alphanumeric/dash/underscore'),
	),
	email: v.pipe(v.string(), v.email('invalid email')),
	password: v.pipe(v.string(), v.minLength(1, 'password required')),
	proxy_url: v.optional(
		v.pipe(
			OptionalCsvString,
			// Accept the WebShare CSV export shape (host:port:user:pass) and bare
			// host:port — normalize to a proper URL before URL validation so
			// non-technical users don't have to reformat.
			v.transform((val) => (typeof val === 'string' ? normalizeProxyInput(val) : val)),
			v.union([
				v.undefined(),
				v.pipe(v.string(), v.url('proxy_url must be a valid URL (http/https/socks5)')),
			]),
		),
	),
	country: v.optional(
		v.pipe(
			OptionalCsvString,
			v.union([v.undefined(), v.pipe(v.string(), v.length(2))]),
			v.transform((val) => val ?? 'FR'),
		),
		'FR',
	),
	preferred_sizes: v.pipe(
		v.string(),
		v.transform((s) =>
			s
				.split(';')
				.map((x) => x.trim())
				.filter(Boolean),
		),
	),
})

export type AccountCsvRow = v.InferOutput<typeof AccountCsvRowSchema>

export type ParseResult = {
	accounts: AccountCsvRow[]
	errors: CsvIssue[]
}

export async function parseAccountsCsv(filePath: string): Promise<ParseResult> {
	const { rows, parseErrors, rowToSourceLine } = await readCsvRows(filePath)

	const accounts: AccountCsvRow[] = []
	const errors: CsvIssue[] = [...parseErrors]
	const seenIds = new Set<string>()

	rows.forEach((row, idx) => {
		// Map filtered-row index → user-visible source line so error reports
		// stay accurate when comments / blank lines precede the data.
		const rowNum = rowToSourceLine[idx] ?? idx + 2
		const result = v.safeParse(AccountCsvRowSchema, row)
		if (!result.success) {
			for (const issue of result.issues) {
				const column = String(issue.path?.[0]?.key ?? 'unknown')
				const rawValue = String(row[column] ?? '')
				errors.push({
					row: rowNum,
					column,
					value: column === 'password' ? '***' : rawValue,
					message: issue.message,
					suggestion: suggestionFor(column),
				})
			}
			return
		}
		if (seenIds.has(result.output.account_id)) {
			errors.push({
				row: rowNum,
				column: 'account_id',
				value: result.output.account_id,
				message: 'duplicate account_id',
				suggestion: 'account_ids must be unique',
			})
			return
		}
		seenIds.add(result.output.account_id)
		accounts.push(result.output)
	})

	return { accounts, errors }
}

function suggestionFor(column: string): string | undefined {
	if (column === 'email') return 'expected format: user@domain.tld'
	if (column === 'preferred_sizes') return 'use ";" to separate sizes (e.g. 42;42.5;43)'
	if (column === 'proxy_url') return 'expected http://user:pass@host:port or socks5://...'
	return undefined
}
