import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir, platform } from 'node:os'
import { join } from 'node:path'
import { initWithPassphrase, importCardsCsv, getCard, resetDb } from './cardsStore.ts'

async function withTempDir(fn: (dir: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), 'nike-bot-cards-'))
	try {
		await fn(dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

test('canary validates the correct passphrase on re-open', async () => {
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		const first = await initWithPassphrase('super-secret', db)
		assert.equal(first.key.length, 32)
		// Re-open with same passphrase — should not throw.
		const second = await initWithPassphrase('super-secret', db)
		assert.ok(first.key.equals(second.key), 'derived key should match')
	})
})

test('canary rejects a wrong passphrase', async () => {
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		await initWithPassphrase('correct-pass', db)
		await assert.rejects(() => initWithPassphrase('wrong-pass', db), /Wrong passphrase/)
	})
})

test('wrong passphrase is rate-limited (~3s) to slow brute-force attempts', async () => {
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		await initWithPassphrase('correct-pass', db)
		const t0 = Date.now()
		await assert.rejects(() => initWithPassphrase('wrong-pass', db), /Wrong passphrase/)
		assert.ok(
			Date.now() - t0 >= 2500,
			`expected wrong-passphrase reject to take >=2500ms, took ${Date.now() - t0}ms`,
		)
	})
})

test('import transaction inserts all rows and renames source to .imported', async () => {
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		const csv = join(dir, 'cards.csv')
		const content =
			'account_id,card_number,expiry,cvv,holder_name\n' +
			'kev_001,4111111111111111,09/27,123,Kevin One\n' +
			'kev_002,4222222222222,10/28,4567,Kevin Two\n' +
			'kev_003,4333333333333333,11/29,321,Kevin Three\n' +
			'kev_004,4444444444444444,12/30,987,Kevin Four\n' +
			'kev_005,4555555555555555,01/31,555,Kevin Five\n'
		await writeFile(csv, content, 'utf8')

		const { key } = await initWithPassphrase('pw', db)
		const result = await importCardsCsv(csv, key, db)
		assert.equal(result.errors.length, 0)
		assert.equal(result.imported, 5)

		// Source renamed.
		const renamedStat = await stat(csv + '.imported')
		assert.ok(renamedStat.isFile())

		// Decrypt round-trip for each row.
		const r1 = getCard('kev_001', key, db)
		assert.ok(r1)
		assert.equal(r1.card_number, '4111111111111111')
		assert.equal(r1.expiry, '09/27')
		assert.equal(r1.cvv, '123')
		assert.equal(r1.holder_name, 'Kevin One')

		const r5 = getCard('kev_005', key, db)
		assert.ok(r5)
		assert.equal(r5.card_number, '4555555555555555')
	})
})

test('raw DB file does not contain the plaintext card number (encryption sanity)', async () => {
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		const csv = join(dir, 'cards.csv')
		const PAN = '4012888888881881'
		await writeFile(
			csv,
			'account_id,card_number,expiry,cvv,holder_name\n' +
				`sanity_001,${PAN},09/27,123,Sanity Check\n`,
			'utf8',
		)
		const { key } = await initWithPassphrase('pw', db)
		await importCardsCsv(csv, key, db)

		const raw = await readFile(db)
		assert.equal(raw.includes(PAN), false, 'plaintext PAN leaked into DB file')
		// ASCII CVV byte sequence
		assert.equal(raw.includes(Buffer.from('Sanity Check')) && raw.includes(Buffer.from(PAN)), false)
	})
})

test('import rolls back the transaction on failure (all-or-nothing)', async () => {
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		const csv = join(dir, 'cards.csv')
		// Two valid rows with *duplicate* account_id — parser should surface the
		// duplicate as an error so no rows hit the DB.
		await writeFile(
			csv,
			'account_id,card_number,expiry,cvv,holder_name\n' +
				'dup_001,4111111111111111,09/27,123,Ok One\n' +
				'dup_001,4222222222222,10/28,456,Ok Two\n',
			'utf8',
		)
		const { key } = await initWithPassphrase('pw', db)
		const result = await importCardsCsv(csv, key, db)
		assert.equal(result.imported, 0)
		assert.ok(result.errors.length > 0)
		assert.equal(getCard('dup_001', key, db), null)
	})
})

test('cards.db file is chmod 0o600 (owner-only) on POSIX', async (t) => {
	if (platform() === 'win32') {
		t.skip('POSIX modes not honored on Windows')
		return
	}
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		await initWithPassphrase('pw', db)
		const s = await stat(db)
		// Mask off file-type bits, leaving the permission bits.
		const perms = s.mode & 0o777
		assert.equal(
			perms,
			0o600,
			`expected cards.db permissions 0o600, got 0o${perms.toString(8)}`,
		)
	})
})

test('resetDb moves the db aside so a new passphrase can be set', async () => {
	await withTempDir(async (dir) => {
		const db = join(dir, 'cards.db')
		await initWithPassphrase('first-pass', db)
		const backup = resetDb(db)
		assert.ok(backup, 'backup path returned')
		// New init with different passphrase succeeds (fresh salt + canary).
		const { key } = await initWithPassphrase('new-pass', db)
		assert.equal(key.length, 32)
	})
})
