import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeReport, type ReportRow } from './reportWriter.ts'

async function makeTmp(): Promise<string> {
	return await mkdtemp(join(tmpdir(), 'report-writer-'))
}

async function cleanup(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true })
}

test('escape edges: cell with comma, quote, newline round-trips', async () => {
	const dir = await makeTmp()
	try {
		const rows: ReportRow[] = [
			{
				account_id: 'acct,with,comma',
				status: 'COP',
				sku: 'SKU"quoted"',
				size: 'US 10\nnext-line',
				order_number: 'O1',
				timestamp: '2026-04-24T12:00:00.000Z',
				duration_ms: 42,
			},
		]
		const file = await writeReport(rows, dir)
		const content = await readFile(file, 'utf8')
		const lines = content.split('\n')
		assert.equal(lines[0], 'account_id,status,sku,name,size,order_number,timestamp,error_reason,duration_ms,retry_attempt')
		// Comma wrap
		assert.ok(lines[1].includes('"acct,with,comma"'), 'comma cell must be quote-wrapped')
		// Double-double-quote escape
		assert.ok(content.includes('"SKU""quoted"""'), 'quote must be doubled and wrapped')
		// Newline inside cell — wrapped, so line count > row count+1
		assert.ok(content.includes('"US 10\nnext-line"'), 'newline cell must be quoted')
	} finally {
		await cleanup(dir)
	}
})

test('atomic rename: no .tmp leftover after writeReport', async () => {
	const dir = await makeTmp()
	try {
		const rows: ReportRow[] = [
			{
				account_id: 'a',
				status: 'COP',
				sku: 's',
				timestamp: '2026-04-24T12:00:00.000Z',
				duration_ms: 100,
			},
		]
		await writeReport(rows, dir)
		const entries = await readdir(dir)
		const tmpLeftover = entries.filter((e) => e.endsWith('.tmp'))
		assert.deepEqual(tmpLeftover, [], 'no .tmp files must remain')
		assert.equal(entries.length, 1, 'exactly one csv produced')
		assert.ok(entries[0].endsWith('.csv'))
	} finally {
		await cleanup(dir)
	}
})

test('credential mask: proxy URL with user:pass redacted in error_reason output', async () => {
	const dir = await makeTmp()
	try {
		const rows: ReportRow[] = [
			{
				account_id: 'acct',
				status: 'ERROR',
				sku: 'sku',
				timestamp: '2026-04-24T12:00:00.000Z',
				error_reason: 'proxy http://user123:secret@host.com:8080 failed card 4111111111111111',
				duration_ms: 5,
			},
		]
		const file = await writeReport(rows, dir)
		const content = await readFile(file, 'utf8')
		assert.ok(!content.includes('user123:secret@'), 'user:pass@ must be redacted')
		assert.ok(!content.includes('secret'), 'password must not leak')
		assert.ok(content.includes('***:***@'), 'redacted marker present')
		assert.ok(!content.includes('4111111111111111'), 'card digits must be masked')
		assert.ok(content.includes('****'), 'digit-run mask present')
	} finally {
		await cleanup(dir)
	}
})

test('collision suffix: write twice in same second → second is -1.csv', async () => {
	const dir = await makeTmp()
	try {
		const rows: ReportRow[] = [
			{
				account_id: 'a',
				status: 'COP',
				sku: 's',
				timestamp: '2026-04-24T12:00:00.000Z',
				duration_ms: 1,
			},
		]
		const f1 = await writeReport(rows, dir)
		const f2 = await writeReport(rows, dir)
		assert.notEqual(f1, f2, 'second path must differ')
		assert.ok(f2.endsWith('-1.csv'), `second file must use -1 suffix, got ${f2}`)
		const entries = (await readdir(dir)).sort()
		assert.equal(entries.length, 2)
	} finally {
		await cleanup(dir)
	}
})

test('timestamp ISO format appears in output', async () => {
	const dir = await makeTmp()
	try {
		const iso = new Date().toISOString()
		const rows: ReportRow[] = [
			{
				account_id: 'a',
				status: 'COP',
				sku: 's',
				timestamp: iso,
				duration_ms: 1,
			},
		]
		const file = await writeReport(rows, dir)
		const content = await readFile(file, 'utf8')
		assert.ok(content.includes(iso), 'ISO timestamp must appear verbatim')
		// ISO regex sanity
		assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
	} finally {
		await cleanup(dir)
	}
})

test('appendToFile: new file then append 2 rows → header + original + 2 new, no extra header', async () => {
	const dir = await makeTmp()
	try {
		const original: ReportRow[] = [
			{
				account_id: 'a1',
				status: 'COP',
				sku: 's',
				timestamp: '2026-04-24T12:00:00.000Z',
				duration_ms: 10,
			},
		]
		const file = await writeReport(original, dir)

		const extra: ReportRow[] = [
			{
				account_id: 'a2',
				status: 'BLOCKED',
				sku: 's',
				timestamp: '2026-04-24T12:00:01.000Z',
				duration_ms: 20,
				retry_attempt: 2,
			},
			{
				account_id: 'a3',
				status: 'ERROR',
				sku: 's',
				timestamp: '2026-04-24T12:00:02.000Z',
				duration_ms: 30,
				retry_attempt: 2,
			},
		]
		const appended = await writeReport(extra, dir, { appendToFile: file })
		assert.equal(appended, file, 'append returns the same path')

		const content = await readFile(file, 'utf8')
		const lines = content.split('\n').filter((l) => l.length > 0)
		assert.equal(lines.length, 1 + 1 + 2, 'header + 1 original + 2 appended')
		assert.equal(
			lines[0],
			'account_id,status,sku,name,size,order_number,timestamp,error_reason,duration_ms,retry_attempt',
		)
		// Ensure header appears exactly once.
		const headerCount = (content.match(/^account_id,status,sku/gm) ?? []).length
		assert.equal(headerCount, 1, 'header must not be duplicated on append')
		assert.ok(lines[1].startsWith('a1,COP,'))
		assert.ok(lines[2].startsWith('a2,BLOCKED,'))
		assert.ok(lines[3].startsWith('a3,ERROR,'))
		// Only one file in the directory (append didn't create a second one).
		const entries = await readdir(dir)
		assert.equal(entries.length, 1)
	} finally {
		await cleanup(dir)
	}
})

test('empty rows produce header-only file with trailing newline', async () => {
	const dir = await makeTmp()
	try {
		const file = await writeReport([], dir)
		const content = await readFile(file, 'utf8')
		assert.equal(
			content,
			'account_id,status,sku,name,size,order_number,timestamp,error_reason,duration_ms,retry_attempt\n',
		)
		assert.ok(content.endsWith('\n'), 'POSIX trailing newline required')
	} finally {
		await cleanup(dir)
	}
})
