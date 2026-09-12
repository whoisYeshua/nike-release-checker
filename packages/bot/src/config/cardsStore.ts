import Database from 'better-sqlite3'
import { mkdirSync, existsSync, renameSync, chmodSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { deriveKey, encrypt, decrypt, newSalt } from './cardsCrypto.ts'
import { parseCardsCsv, type CardCsvRow } from './cardsCsv.ts'
import type { CsvIssue } from './csvRead.ts'

const CANARY_PLAINTEXT = 'nike-bot-canary'

/**
 * Resolve the per-user directory that holds the encrypted cards DB.
 * Creates the directory with 0o700 (owner-only) on POSIX; on Windows the
 * mode flag is ignored but the location (APPDATA) is user-scoped.
 */
export function dbPath(): string {
	const base =
		platform() === 'win32'
			? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
			: join(homedir(), '.nike-bot')
	mkdirSync(base, { recursive: true, mode: 0o700 })
	return join(base, 'cards.db')
}

function openDbAt(path: string): Database.Database {
	const db = new Database(path)
	db.pragma('journal_mode = WAL')
	db.exec(`
		CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v BLOB NOT NULL);
		CREATE TABLE IF NOT EXISTS cards (
			account_id TEXT PRIMARY KEY,
			holder_name TEXT NOT NULL,
			card_number_ct BLOB NOT NULL, card_number_iv BLOB NOT NULL, card_number_tag BLOB NOT NULL,
			expiry_ct BLOB NOT NULL, expiry_iv BLOB NOT NULL, expiry_tag BLOB NOT NULL,
			cvv_ct BLOB NOT NULL, cvv_iv BLOB NOT NULL, cvv_tag BLOB NOT NULL
		);
	`)
	// Lock down DB file to owner-only (0o600) — defends against umask leaving the
	// encrypted card store world-readable on multi-user POSIX systems. Windows
	// ignores POSIX modes, so any errors there are silently swallowed.
	try {
		chmodSync(path, 0o600)
	} catch {
		// noop — Windows / unsupported FS
	}
	return db
}

function openDb(): Database.Database {
	return openDbAt(dbPath())
}

/**
 * Initialise (or re-open) the encrypted DB with a user-supplied passphrase.
 *
 * First run: generate a fresh salt, derive the key, and encrypt a canary
 * value; store salt + canary in the `meta` table.
 *
 * Subsequent runs: re-derive the key from the stored salt and attempt to
 * decrypt the canary. Failure (authTag mismatch) indicates the wrong
 * passphrase — we throw a clean error.
 */
export async function initWithPassphrase(
	passphrase: string,
	overridePath?: string,
): Promise<{ salt: Buffer; key: Buffer }> {
	const db = overridePath ? openDbAt(overridePath) : openDb()
	try {
		const saltRow = db.prepare(`SELECT v FROM meta WHERE k = 'salt'`).get() as
			| { v: Buffer }
			| undefined
		let salt: Buffer
		if (!saltRow) {
			salt = newSalt()
			db.prepare(`INSERT INTO meta (k, v) VALUES ('salt', ?)`).run(salt)
		} else {
			salt = Buffer.from(saltRow.v)
		}
		const key = deriveKey(passphrase, salt)

		const canaryRow = db.prepare(`SELECT v FROM meta WHERE k = 'canary'`).get() as
			| { v: Buffer }
			| undefined
		if (!canaryRow) {
			const enc = encrypt(CANARY_PLAINTEXT, key)
			const blob = Buffer.concat([enc.iv, enc.tag, enc.ct])
			db.prepare(`INSERT INTO meta (k, v) VALUES ('canary', ?)`).run(blob)
		} else {
			const blob = Buffer.from(canaryRow.v)
			let canaryOk = false
			try {
				const iv = blob.subarray(0, 12)
				const tag = blob.subarray(12, 28)
				const ct = blob.subarray(28)
				const pt = decrypt(ct, iv, tag, key)
				canaryOk = pt === CANARY_PLAINTEXT
			} catch {
				canaryOk = false
			}
			if (!canaryOk) {
				// Rate-limit brute-force attempts: pause before surfacing the error.
				await new Promise((r) => setTimeout(r, 3000))
				throw new Error('Wrong passphrase')
			}
		}
		return { salt, key }
	} finally {
		db.close()
	}
}

export async function importCardsCsv(
	filePath: string,
	key: Buffer,
	overridePath?: string,
): Promise<{ imported: number; errors: CsvIssue[] }> {
	const { rows, errors } = await parseCardsCsv(filePath)
	if (errors.length > 0) return { imported: 0, errors }

	const db = overridePath ? openDbAt(overridePath) : openDb()
	try {
		const stmt = db.prepare(`
			INSERT OR REPLACE INTO cards
			(account_id, holder_name,
			 card_number_ct, card_number_iv, card_number_tag,
			 expiry_ct, expiry_iv, expiry_tag,
			 cvv_ct, cvv_iv, cvv_tag)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)

		const tx = db.transaction((batch: CardCsvRow[]) => {
			for (const row of batch) {
				const n = encrypt(row.card_number, key)
				const e = encrypt(row.expiry, key)
				const c = encrypt(row.cvv, key)
				stmt.run(
					row.account_id,
					row.holder_name,
					n.ct,
					n.iv,
					n.tag,
					e.ct,
					e.iv,
					e.tag,
					c.ct,
					c.iv,
					c.tag,
				)
			}
		})
		tx(rows)
	} finally {
		db.close()
	}

	// Rename source to prevent re-import / lingering plaintext on disk.
	renameSync(filePath, filePath + '.imported')
	return { imported: rows.length, errors: [] }
}

export function getCard(
	accountId: string,
	key: Buffer,
	overridePath?: string,
): { card_number: string; expiry: string; cvv: string; holder_name: string } | null {
	const db = overridePath ? openDbAt(overridePath) : openDb()
	try {
		const row = db.prepare(`SELECT * FROM cards WHERE account_id = ?`).get(accountId) as
			| {
					holder_name: string
					card_number_ct: Buffer
					card_number_iv: Buffer
					card_number_tag: Buffer
					expiry_ct: Buffer
					expiry_iv: Buffer
					expiry_tag: Buffer
					cvv_ct: Buffer
					cvv_iv: Buffer
					cvv_tag: Buffer
			  }
			| undefined
		if (!row) return null
		return {
			holder_name: row.holder_name,
			card_number: decrypt(row.card_number_ct, row.card_number_iv, row.card_number_tag, key),
			expiry: decrypt(row.expiry_ct, row.expiry_iv, row.expiry_tag, key),
			cvv: decrypt(row.cvv_ct, row.cvv_iv, row.cvv_tag, key),
		}
	} finally {
		db.close()
	}
}

/**
 * Move the existing DB aside (timestamped backup). Next `initWithPassphrase`
 * call will generate a new salt/canary.
 */
export function resetDb(overridePath?: string): string | null {
	const p = overridePath ?? dbPath()
	if (!existsSync(p)) return null
	const backup = p + '.backup-' + Date.now()
	renameSync(p, backup)
	return backup
}
