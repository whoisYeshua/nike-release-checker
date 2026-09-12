import * as v from 'valibot'
import { readCsvRows, type CsvIssue } from './csvRead.ts'

/**
 * cards.csv schema — row fields:
 *   account_id   alphanumeric/dash/underscore, joins to accounts.csv
 *   card_number  13–19 digits (spaces stripped)
 *   expiry       MM/YY
 *   cvv          3–4 digits
 *   holder_name  free text, required
 *
 * Note: card data is extremely sensitive. NEVER log raw values; always mask
 * when emitting errors.
 */

const CardRowSchema = v.object({
	account_id: v.pipe(
		v.string(),
		v.regex(/^[a-zA-Z0-9_-]+$/, 'account_id must be alphanumeric/dash/underscore'),
	),
	card_number: v.pipe(
		v.string(),
		v.transform((s) => s.replace(/\s+/g, '')),
		v.regex(/^\d{13,19}$/, 'card_number must be 13-19 digits'),
	),
	expiry: v.pipe(
		v.string(),
		v.regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'expiry must match MM/YY'),
	),
	cvv: v.pipe(v.string(), v.regex(/^\d{3,4}$/, 'cvv must be 3-4 digits')),
	holder_name: v.pipe(v.string(), v.minLength(1, 'holder_name required')),
})

export type CardCsvRow = v.InferOutput<typeof CardRowSchema>

export type CardsParseResult = {
	rows: CardCsvRow[]
	errors: CsvIssue[]
}

export async function parseCardsCsv(filePath: string): Promise<CardsParseResult> {
	const { rows: rawRows, parseErrors, rowToSourceLine } = await readCsvRows(filePath)

	const rows: CardCsvRow[] = []
	const errors: CsvIssue[] = [...parseErrors]
	const seenIds = new Set<string>()

	rawRows.forEach((row, idx) => {
		const rowNum = rowToSourceLine[idx] ?? idx + 2
		const result = v.safeParse(CardRowSchema, row)
		if (!result.success) {
			for (const issue of result.issues) {
				const column = String(issue.path?.[0]?.key ?? 'unknown')
				errors.push({
					row: rowNum,
					column,
					value: maskForColumn(column, row[column] ?? ''),
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
		rows.push(result.output)
	})

	return { rows, errors }
}

function maskForColumn(column: string, raw: string): string {
	if (column === 'card_number') {
		const digits = raw.replace(/\s+/g, '')
		if (digits.length <= 4) return '****'
		return '****' + digits.slice(-4)
	}
	if (column === 'cvv') return '***'
	return raw
}

function suggestionFor(column: string): string | undefined {
	if (column === 'card_number') return 'expected 13-19 digits (spaces allowed)'
	if (column === 'expiry') return 'expected format: MM/YY (e.g. 09/27)'
	if (column === 'cvv') return 'expected 3 or 4 digits'
	return undefined
}
