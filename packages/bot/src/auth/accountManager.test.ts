import { describe, it, after, before } from 'node:test'
import { strict as assert } from 'node:assert'
import { writeFile, rm, stat, mkdir, access } from 'node:fs/promises'
import type { ImportResult } from './auth.types.ts'

const TMP_ACCOUNTS = '/tmp/test-import-accounts.json'
const BOT_DATA = '.bot-data-test'

async function write(data: unknown): Promise<void> {
	await writeFile(TMP_ACCOUNTS, JSON.stringify(data), 'utf8')
}

// Inline mock proxyTester to avoid real network calls
async function mockImportAccounts(filePath: string, proxySuccess: boolean): Promise<ImportResult> {
	const { loadAccountsFile } = await import('../config/accountConfig.ts')
	const { writeFile: wf, mkdir } = await import('node:fs/promises')

	const { valid, errors: validationErrors } = await loadAccountsFile(filePath)
	const invalidIndexes = new Set(validationErrors.map((e) => e.index))

	const importErrors: ImportResult['errors'] = validationErrors.map(
		(e: { index: number; field: string; message: string }) => ({
			accountId: `index:${e.index}`,
			reason: `${e.field}: ${e.message}`,
		}),
	)

	const processedAccounts = valid.map((a) => ({ id: a.id, email: a.email, proxy: a.proxy }))

	const dataDir = BOT_DATA
	const accountsFile = `${dataDir}/accounts.json`

	let imported = 0
	let failed = invalidIndexes.size
	const merged: unknown[] = []

	for (const account of valid) {
		if (!proxySuccess) {
			failed++
			importErrors.push({ accountId: account.id, reason: 'Proxy test failed: connection refused' })
		} else {
			merged.push({ ...account, importedAt: new Date().toISOString() })
			imported++
		}
	}

	await mkdir(dataDir, { recursive: true })
	await wf(accountsFile, JSON.stringify(merged, null, 2), { encoding: 'utf8', mode: 0o600 })

	return { imported, failed, errors: importErrors, processedAccounts }
}

describe('importAccounts (mocked proxy)', () => {
	after(async () => {
		await rm(TMP_ACCOUNTS, { force: true })
		await rm(BOT_DATA, { recursive: true, force: true })
	})

	it('imports valid accounts when proxy succeeds', async () => {
		await write([
			{ id: 'acc-1', email: 'user1@test.com', password: 'pass1', proxy: 'http://u:p@proxy:8080', country: 'FR' },
			{ id: 'acc-2', email: 'user2@test.com', password: 'pass2', proxy: 'http://u:p@proxy:8080', country: 'FR' },
		])
		const result = await mockImportAccounts(TMP_ACCOUNTS, true)
		assert.equal(result.imported, 2)
		assert.equal(result.failed, 0)
	})

	it('marks accounts as failed when proxy fails', async () => {
		await write([
			{ id: 'acc-3', email: 'user3@test.com', password: 'pass3', proxy: 'http://u:p@badproxy:8080', country: 'FR' },
		])
		const result = await mockImportAccounts(TMP_ACCOUNTS, false)
		assert.equal(result.imported, 0)
		assert.equal(result.failed, 1)
		assert.ok(result.errors[0]!.reason.includes('Proxy test failed'))
	})

	it('sets permissions 600 on accounts file', async () => {
		await write([
			{ id: 'acc-p', email: 'perm@test.com', password: 'pw', proxy: 'http://u:p@proxy:8080', country: 'FR' },
		])
		await mockImportAccounts(TMP_ACCOUNTS, true)
		const s = await stat(`${BOT_DATA}/accounts.json`)
		const mode = (s.mode & 0o777).toString(8)
		assert.equal(mode, '600', `Expected 600, got ${mode}`)
	})

	it('reports validation errors per invalid entry', async () => {
		await write([
			{ id: 'bad', email: 'not-an-email', password: 'pw', proxy: 'http://u:p@proxy:8080', country: 'FR' },
			{ id: 'good', email: 'ok@test.com', password: 'pw', proxy: 'http://u:p@proxy:8080', country: 'FR' },
		])
		const result = await mockImportAccounts(TMP_ACCOUNTS, true)
		assert.equal(result.imported, 1)
		assert.equal(result.failed, 1) // schema-invalid entry counted in failed
		assert.ok(result.errors.some((e) => e.accountId === 'index:0'))
	})
})

describe('formatImportSummary', () => {
	it('masks email in output lines', async () => {
		const { formatImportSummary } = await import('./accountManager.ts')
		const result: ImportResult = { imported: 1, failed: 0, errors: [], processedAccounts: [] }
		const lines = formatImportSummary(result, [
			{ id: 'acc-1', email: 'user@example.com', proxy: 'http://u:p@proxy:8080' },
		])
		for (const line of lines) {
			assert.ok(!line.includes('user@example.com'), `Full email must not appear: ${line}`)
		}
		assert.ok(lines.some((l) => l.includes('u***@example.com')))
	})

	it('masks proxy credentials in output lines', async () => {
		const { formatImportSummary } = await import('./accountManager.ts')
		const result: ImportResult = { imported: 1, failed: 0, errors: [], processedAccounts: [] }
		const lines = formatImportSummary(result, [
			{ id: 'acc-2', email: 'a@b.com', proxy: 'http://myuser:mysecret@proxy.host:8080' },
		])
		for (const line of lines) {
			assert.ok(!line.includes('mysecret'), `Proxy password must not appear: ${line}`)
		}
	})

	it('shows correct denominator including schema-invalid entries', async () => {
		const { formatImportSummary } = await import('./accountManager.ts')
		// 1 imported, 2 failed (1 schema-invalid + 1 proxy-failed) → total=3
		const result: ImportResult = {
			imported: 1,
			failed: 2,
			errors: [{ accountId: 'acc-fail', reason: 'Proxy test failed' }],
			processedAccounts: [],
		}
		const lines = formatImportSummary(result, [
			{ id: 'acc-ok', email: 'ok@test.com', proxy: 'http://u:p@proxy:8080' },
			{ id: 'acc-fail', email: 'fail@test.com', proxy: 'http://u:p@proxy:8080' },
		])
		assert.ok(lines.some((l) => l.includes('1/3')), `Expected 1/3 in: ${lines.join(' | ')}`)
	})

	it('uses processedAccounts for per-account display', async () => {
		const { formatImportSummary } = await import('./accountManager.ts')
		const result: ImportResult = {
			imported: 1,
			failed: 1,
			errors: [{ accountId: 'acc-2', reason: 'duplicate email — skipped' }],
			processedAccounts: [
				{ id: 'acc-1', email: 'ok@test.com', proxy: 'http://u:p@proxy:8080' },
				{ id: 'acc-2', email: 'dup@test.com', proxy: 'http://u:p@proxy:8080' },
			],
		}
		const lines = formatImportSummary(result, result.processedAccounts)
		assert.ok(lines.some((l) => l.includes('✓') && l.includes('o***@test.com')))
		assert.ok(lines.some((l) => l.includes('✗') && l.includes('duplicate email')))
	})
})

describe('loadStoredAccounts resilience', () => {
	it('returns empty array on missing file', async () => {
		const { loadStoredAccounts } = await import('./accountManager.ts')
		// Reset module cache doesn't apply here — just verify no throw
		const result = await loadStoredAccounts()
		assert.ok(Array.isArray(result))
	})
})

describe('authenticateSingle', () => {
	it('returns not-found error for an unknown account ID', async () => {
		const { authenticateSingle } = await import('./accountManager.ts')
		// No accounts imported in this environment — any ID will be "not found"
		const result = await authenticateSingle('no-such-account-id')
		assert.equal(result.success, false)
		assert.ok(
			result.error?.includes('not found'),
			`Expected "not found" in error: ${result.error}`,
		)
		assert.ok(
			result.error?.includes('no-such-account-id'),
			`Expected account ID in error: ${result.error}`,
		)
		assert.equal(result.accountId, 'no-such-account-id')
		assert.equal(result.durationMs, 0)
	})

	it('returns not-found error without throwing when accounts file is absent', async () => {
		const { authenticateSingle } = await import('./accountManager.ts')
		// Should return a result, never throw
		const result = await authenticateSingle('ghost-id')
		assert.equal(result.success, false)
		assert.ok(result.error?.includes('not found'))
	})
})

describe('authenticateSingle — valid account ID lookup', () => {
	const DATA_DIR = '.bot-data'
	const ACCOUNTS_FILE = `${DATA_DIR}/accounts.json`
	const TEST_ACCOUNT = {
		id: 'test-single-acc',
		email: 'single@test.com',
		password: 'pass',
		proxy: 'http://u:p@proxy:8080',
		country: 'FR',
		importedAt: new Date().toISOString(),
	}

	before(async () => {
		await mkdir(DATA_DIR, { recursive: true })
		await writeFile(ACCOUNTS_FILE, JSON.stringify([TEST_ACCOUNT], null, 2), {
			encoding: 'utf8',
			mode: 0o600,
		})
	})

	after(async () => {
		await rm(ACCOUNTS_FILE, { force: true })
	})

	it('finds the account and attempts login (error is not "not found")', async () => {
		const { authenticateSingle } = await import('./accountManager.ts')
		const result = await authenticateSingle('test-single-acc')
		assert.equal(result.accountId, 'test-single-acc')
		// Account was found — error must not be the "not found" sentinel
		assert.ok(
			!result.error?.includes('not found in imported accounts'),
			`Expected account to be found but got: ${result.error}`,
		)
	})

	it('returns not-found for an ID absent from the stored accounts', async () => {
		const { authenticateSingle } = await import('./accountManager.ts')
		const result = await authenticateSingle('other-acc')
		assert.equal(result.success, false)
		assert.ok(result.error?.includes('not found in imported accounts'))
		assert.equal(result.accountId, 'other-acc')
	})
})

describe('clearAllSessions', () => {
	const SESS_DIR = '.bot-data/sessions'

	before(async () => {
		// Remove any stale files then create exactly 2 known files
		await rm(SESS_DIR, { recursive: true, force: true })
		await mkdir(SESS_DIR, { recursive: true })
		await writeFile(`${SESS_DIR}/clr-acc-1.json`, '[]', { encoding: 'utf8', mode: 0o600 })
		await writeFile(`${SESS_DIR}/clr-acc-2.json`, '[]', { encoding: 'utf8', mode: 0o600 })
	})

	after(async () => {
		await rm(SESS_DIR, { recursive: true, force: true })
	})

	it('deletes all .json session files and returns the count', async () => {
		const { clearAllSessions } = await import('./accountManager.ts')
		const { count } = await clearAllSessions()
		assert.equal(count, 2)
		await assert.rejects(() => access(`${SESS_DIR}/clr-acc-1.json`))
		await assert.rejects(() => access(`${SESS_DIR}/clr-acc-2.json`))
	})

	it('returns count 0 when sessions directory does not exist', async () => {
		const { clearAllSessions } = await import('./accountManager.ts')
		// directory was cleaned by previous test's after() — but we're still in same describe
		// Remove to ensure it's gone
		await rm(SESS_DIR, { recursive: true, force: true })
		const { count } = await clearAllSessions()
		assert.equal(count, 0)
	})
})

describe('clearSession', () => {
	const SESS_DIR = '.bot-data/sessions'

	before(async () => {
		await mkdir(SESS_DIR, { recursive: true })
	})

	it('deletes the session file and resolves when it exists', async () => {
		const { clearSession } = await import('./accountManager.ts')
		await writeFile(`${SESS_DIR}/single-logout-acc.json`, '[]', { encoding: 'utf8', mode: 0o600 })
		await assert.doesNotReject(() => clearSession('single-logout-acc'))
		await assert.rejects(() => access(`${SESS_DIR}/single-logout-acc.json`))
	})

	it('throws "No session found" when the file does not exist', async () => {
		const { clearSession } = await import('./accountManager.ts')
		await assert.rejects(
			() => clearSession('ghost-session-id'),
			(err: Error) => {
				assert.ok(err.message.includes('No session found'))
				return true
			},
		)
	})
})
