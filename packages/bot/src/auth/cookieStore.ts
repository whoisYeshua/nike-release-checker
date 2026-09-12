import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { BrowserContext } from 'playwright'
import type { CookieData } from './auth.types.ts'

const DEFAULT_SESSIONS_DIR = '.bot-data/sessions'

const LOGIN_DOMAINS = ['.nike.com', 'accounts.nike.com', 'api.nike.com', '.paypal.com']

export async function captureCookies(context: BrowserContext): Promise<CookieData[]> {
	const all = await context.cookies()
	return all.filter((c) =>
		LOGIN_DOMAINS.some((d) => c.domain === d || c.domain.endsWith(d)),
	) as CookieData[]
}

function sanitizeAccountId(accountId: string): string {
	const safeId = basename(accountId)
	if (!safeId || /^\.+$/.test(safeId)) {
		throw new Error(`Invalid account ID: '${accountId}'`)
	}
	return safeId
}

export async function persistCookies(
	accountId: string,
	cookies: CookieData[],
	sessionsDir = DEFAULT_SESSIONS_DIR,
): Promise<void> {
	const safeId = sanitizeAccountId(accountId)
	await mkdir(sessionsDir, { recursive: true })
	const filePath = join(sessionsDir, `${safeId}.json`)
	await writeFile(filePath, JSON.stringify(cookies, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function isValidCookieArray(parsed: unknown): parsed is CookieData[] {
	if (!Array.isArray(parsed)) return false
	return parsed.every((c) => {
		if (c === null || typeof c !== 'object') return false
		const o = c as Record<string, unknown>
		return (
			typeof o.name === 'string' &&
			typeof o.value === 'string' &&
			typeof o.domain === 'string' &&
			typeof o.path === 'string' &&
			typeof o.expires === 'number' &&
			typeof o.httpOnly === 'boolean' &&
			typeof o.secure === 'boolean'
		)
	})
}

export async function loadCookies(
	accountId: string,
	sessionsDir = DEFAULT_SESSIONS_DIR,
): Promise<CookieData[]> {
	const safeId = sanitizeAccountId(accountId)
	const filePath = join(sessionsDir, `${safeId}.json`)

	let raw: string
	try {
		raw = await readFile(filePath, 'utf8')
	} catch {
		throw new Error(
			`Session file missing for account '${accountId}'. Run 'nike-bot login-all --account ${accountId}' to authenticate.`,
		)
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		throw new Error(
			`Session file corrupted for account '${accountId}'. Re-authenticate with 'nike-bot login-all --account ${accountId}'.`,
		)
	}

	if (!isValidCookieArray(parsed)) {
		throw new Error(
			`Session file corrupted for account '${accountId}'. Re-authenticate with 'nike-bot login-all --account ${accountId}'.`,
		)
	}

	return parsed
}

export async function injectCookies(context: BrowserContext, cookies: CookieData[]): Promise<void> {
	if (cookies.length === 0) return
	await context.addCookies(cookies)
	const byDomain = cookies.reduce<Record<string, number>>((acc, c) => {
		const domain = c.domain.replace(/^\./, '')
		acc[domain] = (acc[domain] ?? 0) + 1
		return acc
	}, {})
	const domainSummary = Object.entries(byDomain)
		.map(([d, n]) => `${d}: ${n}`)
		.join(', ')
	console.log(`Injected ${cookies.length} cookies (${domainSummary})`)
}

export async function loadAndInjectCookies(
	context: BrowserContext,
	accountId: string,
	sessionsDir = DEFAULT_SESSIONS_DIR,
): Promise<void> {
	const cookies = await loadCookies(accountId, sessionsDir)
	await injectCookies(context, cookies)
}
