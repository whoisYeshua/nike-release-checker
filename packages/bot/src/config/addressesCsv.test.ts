import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAddressesCsv } from './addressesCsv.ts'

async function withTempCsv(content: string, fn: (path: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), 'nike-bot-addr-test-'))
	const file = join(dir, 'addresses.csv')
	await writeFile(file, content, 'utf8')
	try {
		await fn(file)
	} finally {
		await rm(dir, { recursive: true })
	}
}

test('happy path — 2 valid rows joined on account_id', async () => {
	await withTempCsv(
		'account_id,street,city,zip,country,phone\n' +
			'kev_001,1 rue Rivoli,Paris,75001,FR,+33100000000\n' +
			'kev_002,10 Downing St,London,SW1A2AA,GB,+447700900000',
		async (f) => {
			const known = new Set(['kev_001', 'kev_002'])
			const countries = new Map([
				['kev_001', 'FR'],
				['kev_002', 'GB'],
			])
			const r = await parseAddressesCsv(f, known, countries)
			assert.equal(r.errors.length, 0)
			assert.equal(r.warnings.length, 0)
			assert.equal(r.byAccountId.size, 2)
			assert.equal(r.byAccountId.get('kev_001')?.city, 'Paris')
			assert.equal(r.byAccountId.get('kev_002')?.country, 'GB')
		},
	)
})

test('orphan row — account_id not in known set produces warning', async () => {
	await withTempCsv(
		'account_id,street,city,zip,country,phone\n' +
			'ghost_999,Somewhere,Nowhere,00000,FR,',
		async (f) => {
			const known = new Set<string>()
			const countries = new Map<string, string>()
			const r = await parseAddressesCsv(f, known, countries)
			assert.equal(r.errors.length, 0)
			assert.equal(r.byAccountId.size, 0)
			assert.ok(r.warnings.some((w) => /orphan/.test(w.message)))
		},
	)
})

test('country mismatch — warning mentions both values, row still added', async () => {
	await withTempCsv(
		'account_id,street,city,zip,country,phone\n' +
			'kev_001,1 rue Rivoli,Paris,75001,DE,',
		async (f) => {
			const known = new Set(['kev_001'])
			const countries = new Map([['kev_001', 'FR']])
			const r = await parseAddressesCsv(f, known, countries)
			assert.equal(r.errors.length, 0)
			assert.equal(r.byAccountId.size, 1)
			const mismatch = r.warnings.find((w) => w.column === 'country')
			assert.ok(mismatch, 'expected country mismatch warning')
			assert.match(mismatch!.message, /FR/)
			assert.match(mismatch!.message, /DE/)
		},
	)
})

test('missing address — account in known set but not in CSV produces warning', async () => {
	await withTempCsv(
		'account_id,street,city,zip,country,phone\n' +
			'kev_001,1 rue Rivoli,Paris,75001,FR,',
		async (f) => {
			const known = new Set(['kev_001', 'kev_002'])
			const countries = new Map([
				['kev_001', 'FR'],
				['kev_002', 'FR'],
			])
			const r = await parseAddressesCsv(f, known, countries)
			assert.equal(r.errors.length, 0)
			assert.equal(r.byAccountId.size, 1)
			const missing = r.warnings.find(
				(w) => w.value === 'kev_002' && /no shipping address/.test(w.message),
			)
			assert.ok(missing, 'expected missing-address warning for kev_002')
		},
	)
})

test('empty phone is OK (optional field)', async () => {
	await withTempCsv(
		'account_id,street,city,zip,country,phone\n' +
			'kev_001,1 rue Rivoli,Paris,75001,FR,',
		async (f) => {
			const known = new Set(['kev_001'])
			const countries = new Map([['kev_001', 'FR']])
			const r = await parseAddressesCsv(f, known, countries)
			assert.equal(r.errors.length, 0)
			assert.equal(r.warnings.length, 0)
			assert.equal(r.byAccountId.size, 1)
		},
	)
})
