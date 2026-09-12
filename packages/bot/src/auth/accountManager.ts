import { writeFile, mkdir, readFile, access, readdir, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename as pathBasename, join } from 'node:path'
import { loadAccountsFile } from '../config/accountConfig.ts'
import { loadSelectors } from '../config/selectors.ts'
import { maskEmail, maskProxy, maskCredentials } from '../logger/credentialMasker.ts'
import { testProxyConnectivity } from './proxyTester.ts'
import { launchRealChrome } from '../stealth/realChrome.ts'
import { performNikeLogin } from './loginFlow.ts'
import { captureCookies, persistCookies } from './cookieStore.ts'
import { validateSession } from './sessionValidator.ts'
import type { AccountConfig } from '../config/accountSchema.ts'
import type { Selectors } from '../config/selectorSchema.ts'
import type { ImportResult, AuthResult, AccountStatusRow } from './auth.types.ts'

const DATA_DIR = '.bot-data'
const ACCOUNTS_FILE = `${DATA_DIR}/accounts.json`

export async function importAccounts(filePath: string): Promise<ImportResult> {
	// Step 1: Load and validate the source file (per-entry, non-throwing)
	const { valid, errors: validationErrors } = await loadAccountsFile(filePath)

	// Count unique schema-invalid entries (multiple errors on same entry → 1 invalid entry)
	const invalidIndexes = new Set(validationErrors.map((e) => e.index))

	const importErrors: ImportResult['errors'] = validationErrors.map((e) => ({
		accountId: `index:${e.index}`,
		reason: `${e.field}: ${e.message}`,
	}))

	// All schema-valid accounts are tracked for per-account display
	const processedAccounts: ImportResult['processedAccounts'] = valid.map((a) => ({
		id: a.id,
		email: a.email,
		proxy: a.proxy,
	}))

	// Step 2: Load existing accounts (dedup by id AND email)
	const existing = await loadStoredAccounts()
	const existingIds = new Set(existing.map((a) => a.id))
	const existingEmails = new Set(existing.map((a) => a.email.toLowerCase()))

	// Step 3: Filter valid accounts for proxy testing (dedup by id and email)
	const toImport: AccountConfig[] = []
	const seenEmails = new Set<string>()

	// failed starts with schema-invalid count so denominator = imported + failed = total input
	let imported = 0
	let failed = invalidIndexes.size

	for (const account of valid) {
		if (existingIds.has(account.id)) {
			failed++
			importErrors.push({ accountId: account.id, reason: 'duplicate id — skipped' })
			continue
		}
		const emailKey = account.email.toLowerCase()
		if (existingEmails.has(emailKey) || seenEmails.has(emailKey)) {
			failed++
			importErrors.push({ accountId: account.id, reason: 'duplicate email — skipped' })
			continue
		}
		seenEmails.add(emailKey)
		toImport.push(account)
	}

	// Test proxies concurrently (skip accounts without a proxy)
	const proxyResults = await Promise.allSettled(
		toImport.map(async (account) => {
			if (!account.proxy) return { account, result: { success: true, latencyMs: 0 } }
			const result = await testProxyConnectivity(account.proxy)
			return { account, result }
		}),
	)

	const merged = [...existing]

	for (let i = 0; i < proxyResults.length; i++) {
		const settled = proxyResults[i]!
		const account = toImport[i]!

		if (settled.status === 'rejected') {
			failed++
			importErrors.push({ accountId: account.id, reason: maskCredentials(String(settled.reason)) })
			continue
		}

		const { result } = settled.value

		if (!result.success) {
			failed++
			importErrors.push({
				accountId: account.id,
				reason: `Proxy test failed (${result.latencyMs}ms): ${result.error ?? 'unknown error'}`,
			})
			continue
		}

		merged.push({ ...account, importedAt: new Date().toISOString() } as AccountConfig & { importedAt: string })
		imported++
	}

	// Step 4: Persist — mode: 0o600 avoids chmod-after-write TOCTOU window
	await mkdir(DATA_DIR, { recursive: true })
	await writeFile(ACCOUNTS_FILE, JSON.stringify(merged, null, 2), { encoding: 'utf8', mode: 0o600 })

	return { imported, failed, errors: importErrors, processedAccounts }
}

export async function loadStoredAccounts(): Promise<(AccountConfig & { importedAt: string })[]> {
	try {
		await access(ACCOUNTS_FILE, constants.F_OK)
	} catch {
		return []
	}
	let raw: string
	try {
		raw = await readFile(ACCOUNTS_FILE, 'utf8')
	} catch {
		return []
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return []
	}
	if (!Array.isArray(parsed)) return []
	return parsed as (AccountConfig & { importedAt: string })[]
}

// Shared per-account login logic — used by both authenticateAll() and authenticateSingle()
//
// Uses launchRealChrome (spawn + connectOverCDP) instead of chromium.launch(). Kasada
// detects Playwright's launch-time CDP injection and freezes the login flow with the
// "Erreur lors de l'analyse de la réponse du serveur" message after the email step;
// attaching to a Chrome we spawn ourselves bypasses that signal entirely.
//
// Each account gets a per-account persistent profile under ~/.nike-bot/profiles/{id},
// and we randomize the debug port per call so multiple authenticateAccount() can run
// in parallel without colliding on port 9222.
async function authenticateAccount(
	account: AccountConfig & { importedAt: string },
	selectors: Selectors,
): Promise<AuthResult> {
	const startMs = Date.now()
	const port = 9300 + Math.floor(Math.random() * 100)
	const handle = await launchRealChrome({ accountId: account.id, headless: false, port, ...(account.proxy ? { proxy: account.proxy } : {}) })
	try {
		// Always open a fresh tab — the initial about:blank page Chrome creates can
		// be torn down right after connectOverCDP attaches (especially in headless=new),
		// causing "Target page, context or browser has been closed" on the first goto.
		const page = await handle.context.newPage()
		const loginResult = await performNikeLogin(page, account.email, account.password, selectors)
		if (loginResult.success) {
			const cookies = await captureCookies(handle.context)
			await persistCookies(account.id, cookies)
			return { accountId: account.id, success: true, durationMs: Date.now() - startMs }
		}
		return {
			accountId: account.id,
			success: false,
			// Mask credentials that may appear in Nike's error page text (NFR6)
			error: maskCredentials(loginResult.error ?? 'unknown error'),
			failureReason: loginResult.failureReason,
			durationMs: Date.now() - startMs,
		}
	} catch (err) {
		return {
			accountId: account.id,
			success: false,
			error: maskCredentials(String(err)),
			failureReason: 'error',
			durationMs: Date.now() - startMs,
		}
	} finally {
		// Suppress close errors so they don't replace the original error already in results
		await handle.close().catch(() => undefined)
	}
}

export async function authenticateAll(): Promise<AuthResult[]> {
	let accounts: Awaited<ReturnType<typeof loadStoredAccounts>>
	try {
		accounts = await loadStoredAccounts()
	} catch (err) {
		return [{ accountId: '<all>', success: false, error: maskCredentials(String(err)), durationMs: 0 }]
	}
	let selectors: Selectors
	try {
		selectors = await loadSelectors()
	} catch (err) {
		return [{ accountId: '<all>', success: false, error: maskCredentials(String(err)), durationMs: 0 }]
	}
	const results: AuthResult[] = []
	for (const account of accounts) {
		results.push(await authenticateAccount(account, selectors))
	}
	return results
}

export async function authenticateSingle(accountId: string): Promise<AuthResult> {
	let accounts: Awaited<ReturnType<typeof loadStoredAccounts>>
	try {
		accounts = await loadStoredAccounts()
	} catch (err) {
		return { accountId, success: false, error: maskCredentials(String(err)), durationMs: 0 }
	}
	const account = accounts.find((a) => a.id === accountId)
	if (!account) {
		return {
			accountId,
			success: false,
			error: `Account '${accountId}' not found in imported accounts`,
			durationMs: 0,
		}
	}
	let selectors: Selectors
	try {
		selectors = await loadSelectors()
	} catch (err) {
		return { accountId, success: false, error: maskCredentials(String(err)), durationMs: 0 }
	}
	return authenticateAccount(account, selectors)
}

export function formatImportSummary(
	result: ImportResult,
	accounts: Array<{ id: string; email: string; proxy?: string }>,
): string[] {
	const lines: string[] = []

	for (const account of accounts) {
		const failure = result.errors.find((e) => e.accountId === account.id)
		const masked = maskEmail(account.email)
		const maskedProxy = account.proxy ? maskProxy(account.proxy) : '(none)'
		if (failure) {
			lines.push(`  ✗ ${masked} (proxy: ${maskedProxy}) — ${failure.reason}`)
		} else {
			lines.push(`  ✓ ${masked} (proxy: ${maskedProxy}) — imported`)
		}
	}

	const total = result.imported + result.failed
	lines.push(`\n${result.imported}/${total} accounts imported. ${result.failed} failed.`)
	return lines
}

export async function listAccounts(verbose: boolean): Promise<AccountStatusRow[]> {
	const accounts = await loadStoredAccounts()
	const sessions = await Promise.all(accounts.map((a) => validateSession(a.id)))
	return accounts.map((account, i) => ({
		id: account.id,
		email: account.email,
		country: account.country,
		proxy: account.proxy,
		session: sessions[i]!,
		...(verbose ? { preferredSizes: account.preferredSizes } : {}),
	}))
}

const SESSIONS_DIR = `${DATA_DIR}/sessions`

export async function clearAllSessions(): Promise<{ count: number }> {
	let files: string[]
	try {
		files = await readdir(SESSIONS_DIR)
	} catch {
		return { count: 0 }
	}
	const jsonFiles = files.filter((f) => f.endsWith('.json'))
	const results = await Promise.allSettled(jsonFiles.map((f) => unlink(join(SESSIONS_DIR, f))))
	const count = results.filter((r) => r.status === 'fulfilled').length
	return { count }
}

export async function clearSession(accountId: string): Promise<void> {
	const safeId = pathBasename(accountId)
	const filePath = join(SESSIONS_DIR, `${safeId}.json`)
	try {
		await unlink(filePath)
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code
		if (code === 'ENOENT') throw new Error(`No session found for account '${accountId}'`)
		throw err
	}
}
