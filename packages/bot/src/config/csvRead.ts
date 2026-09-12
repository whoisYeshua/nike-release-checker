import Papa from 'papaparse'
import { readFile } from 'node:fs/promises'

export type CsvIssue = {
	row: number
	column: string
	value: string
	message: string
	suggestion?: string
}

export type CsvRow = Record<string, string>

export type CsvReadResult = {
	rows: CsvRow[]
	parseErrors: CsvIssue[]
	/**
	 * Maps a 0-based index into `rows` to the 1-based line number in the
	 * original source CSV. Comment lines (`#…`) and blank lines do NOT
	 * advance the row index, but they DO advance the source-line counter,
	 * so error reports can point at the line the user actually sees.
	 */
	rowToSourceLine: number[]
}

/**
 * Shared CSV reader used by all bot config parsers (accounts, addresses, drop, cards).
 *
 * Tolerances (per epic-10 spec):
 * - Strips UTF-8 BOM (Excel exports prepend 0xFEFF)
 * - Skips lines starting with `#` (comments)
 * - Lowercases + trims headers via `transformHeader`
 * - Trims every cell value via `transform`
 * - `skipEmptyLines: 'greedy'` collapses trailing/extra blank lines
 */
export async function readCsvRows(filePath: string): Promise<CsvReadResult> {
	let raw = await readFile(filePath, 'utf8')
	if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

	// Walk the raw input once to compute (a) the filtered text we feed papaparse
	// and (b) a mapping from each non-comment / non-blank line back to the
	// user-visible source-line number. Header occupies the first surviving
	// line; everything after it lands in `parsed.data` in order, so the
	// data-line subset of this map gives us `rowToSourceLine`.
	const sourceLines = raw.split(/\r?\n/)
	const keptText: string[] = []
	const keptSourceLine: number[] = [] // 1-based source line for each kept entry
	for (let i = 0; i < sourceLines.length; i++) {
		const line = sourceLines[i]
		if (/^\s*#/.test(line)) continue
		if (line.trim() === '') continue
		keptText.push(line)
		keptSourceLine.push(i + 1)
	}
	const filtered = keptText.join('\n')

	const parsed = Papa.parse<CsvRow>(filtered, {
		header: true,
		skipEmptyLines: 'greedy',
		transformHeader: (h) => h.trim().toLowerCase(),
		transform: (val) => (typeof val === 'string' ? val.trim() : val),
	})

	// First kept line is the header → data lines start at index 1.
	const rowToSourceLine = keptSourceLine.slice(1)

	const parseErrors: CsvIssue[] = parsed.errors.map((e) => {
		// `e.row` is a 0-based index into `parsed.data` (the data rows).
		const idx = e.row ?? 0
		const sourceLine = rowToSourceLine[idx] ?? idx + 2
		return {
			row: sourceLine,
			column: '_parse',
			value: '',
			message: e.message,
		}
	})

	return { rows: parsed.data, parseErrors, rowToSourceLine }
}
