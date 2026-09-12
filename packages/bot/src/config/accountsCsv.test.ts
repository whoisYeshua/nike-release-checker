import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAccountsCsv } from './accountsCsv.ts'

async function withTempCsv(content: string, fn: (path: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), 'nike-bot-test-'))
	const file = join(dir, 'accounts.csv')
	await writeFile(file, content, 'utf8')
	try {
		await fn(file)
	} finally {
		await rm(dir, { recursive: true })
	}
}

test('happy path — 2 valid rows parsed', async () => {
	await withTempCsv(
		'account_id,email,password,proxy_url,country,preferred_sizes\n' +
			'kev_001,a@b.co,p1,http://u:p@h.com:8080,FR,42;42.5\n' +
			'kev_002,x@y.co,p2,,FR,43',
		async (f) => {
			const r = await parseAccountsCsv(f)
			assert.equal(r.errors.length, 0)
			assert.equal(r.accounts.length, 2)
			assert.deepEqual(r.accounts[0].preferred_sizes, ['42', '42.5'])
		},
	)
})

test('UTF-8 BOM tolerated', async () => {
	await withTempCsv(
		'﻿account_id,email,password,preferred_sizes\nkev_001,a@b.co,p,42',
		async (f) => {
			const r = await parseAccountsCsv(f)
			assert.equal(r.errors.length, 0)
			assert.equal(r.accounts.length, 1)
		},
	)
})

test('duplicate account_id reported', async () => {
	await withTempCsv(
		'account_id,email,password,preferred_sizes\n' +
			'kev_001,a@b.co,p,42\nkev_001,x@y.co,q,43',
		async (f) => {
			const r = await parseAccountsCsv(f)
			assert.equal(r.accounts.length, 1)
			assert.equal(r.errors.length, 1)
			assert.match(r.errors[0].message, /duplicate/)
		},
	)
})

test('password masked in error output', async () => {
	await withTempCsv(
		'account_id,email,password,preferred_sizes\nkev_001,not-an-email,secretpw,42',
		async (f) => {
			const r = await parseAccountsCsv(f)
			assert.ok(r.errors.some((e) => e.column === 'email'))
			// Ensure the raw password value never appears in any error object.
			const serialized = JSON.stringify(r.errors)
			assert.ok(!serialized.includes('secretpw'), 'password value leaked into errors')
			const pwErr = r.errors.find((e) => e.column === 'password')
			if (pwErr) assert.equal(pwErr.value, '***')
		},
	)
})

test('error rows reflect source-file line numbers when comments precede data', async () => {
	// Source layout (1-based lines):
	//   1: # leading comment
	//   2: # another comment
	//   3: # yet another
	//   4: account_id,email,password,preferred_sizes   ← header
	//   5: kev_001,a@b.co,p,42                         ← valid
	//   6: kev_002,x@y.co,q,43                         ← valid
	//   7: kev_003,not-an-email,r,44                   ← invalid (line 7)
	await withTempCsv(
		'# leading comment\n' +
			'# another comment\n' +
			'# yet another\n' +
			'account_id,email,password,preferred_sizes\n' +
			'kev_001,a@b.co,p,42\n' +
			'kev_002,x@y.co,q,43\n' +
			'kev_003,not-an-email,r,44\n',
		async (f) => {
			const r = await parseAccountsCsv(f)
			const emailErr = r.errors.find((e) => e.column === 'email')
			assert.ok(emailErr, 'expected an email error')
			assert.equal(
				emailErr.row,
				7,
				`expected error to point at source line 7, got ${emailErr.row}`,
			)
		},
	)
})

test('malformed proxy URL produces structured error', async () => {
	await withTempCsv(
		'account_id,email,password,proxy_url,preferred_sizes\nkev_001,a@b.co,p,not-a-url,42',
		async (f) => {
			const r = await parseAccountsCsv(f)
			assert.equal(r.accounts.length, 0)
			assert.ok(r.errors.some((e) => e.column === 'proxy_url'))
		},
	)
})
