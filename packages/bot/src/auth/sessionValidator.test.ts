import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { validateSession } from './sessionValidator.ts'
import type { CookieData } from './auth.types.ts'


const SESSIONS_DIR = '.bot-data/sessions-test'
const ID = 'sess-test-account'
const FILE = `${SESSIONS_DIR}/${ID}.json`

function now(): number {
	return Math.floor(Date.now() / 1000)
}

function cookie(overrides: Partial<CookieData> = {}): CookieData {
	return {
		name: 'sid',
		value: 'abc',
		domain: 'accounts.nike.com',
		path: '/',
		expires: now() + 3600,
		httpOnly: true,
		secure: true,
		...overrides,
	}
}

/** All three critical cookies, all valid by default */
function allCritical(expiresOffset = 3600): CookieData[] {
	return [
		cookie({ name: 'sid', domain: 'accounts.nike.com', expires: now() + expiresOffset }),
		cookie({ name: '_abck', domain: '.nike.com', expires: now() + expiresOffset }),
		cookie({ name: 'KP_UIDz', domain: 'api.nike.com', expires: now() + expiresOffset }),
	]
}

async function write(cookies: CookieData[]): Promise<void> {
	await writeFile(FILE, JSON.stringify(cookies, null, 2), { encoding: 'utf8', mode: 0o600 })
}

describe('validateSession', () => {
	before(async () => {
		await mkdir(SESSIONS_DIR, { recursive: true })
	})

	after(async () => {
		await rm(SESSIONS_DIR, { recursive: true, force: true })
	})

	it('returns missing when session file does not exist', async () => {
		const result = await validateSession('no-such-account', SESSIONS_DIR)
		assert.equal(result.status, 'missing')
		assert.equal(result.error, undefined)
	})

	it('returns missing with error when session file contains invalid JSON', async () => {
		await writeFile(FILE, 'not-json', 'utf8')
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'missing')
		assert.equal(result.error, 'corrupted session file')
	})

	it('returns missing with error when session file is not an array', async () => {
		await writeFile(FILE, JSON.stringify({ cookies: [] }), 'utf8')
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'missing')
		assert.equal(result.error, 'corrupted session file')
	})

	it('returns expired when sid cookie has past expiration', async () => {
		const cookies = allCritical()
		cookies[0] = cookie({ name: 'sid', domain: 'accounts.nike.com', expires: now() - 3600 })
		await write(cookies)
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'expired')
		assert.ok(result.lastLogin instanceof Date)
		assert.ok(typeof result.expiredAt === 'number')
	})

	// Anti-bot cookies (_abck Akamai, KP_UIDz Kasada) are regenerated on every
	// visit by a browser that presents a valid `sid`. Their expiry must NOT
	// invalidate the session — only `sid` does. (Bug fix 2026-05-04.)
	it('stays valid when _abck cookie has past expiration (anti-bot cookie, not auth)', async () => {
		const cookies = allCritical()
		cookies[1] = cookie({ name: '_abck', domain: '.nike.com', expires: now() - 3600 })
		await write(cookies)
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'valid')
	})

	it('stays valid when KP_UIDz cookie has past expiration (anti-bot cookie, not auth)', async () => {
		const cookies = allCritical()
		cookies[2] = cookie({ name: 'KP_UIDz', domain: 'api.nike.com', expires: now() - 3600 })
		await write(cookies)
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'valid')
	})

	it('stays valid when only sid is present (no _abck / KP_UIDz at all)', async () => {
		await write([cookie({ name: 'sid', domain: '.accounts.nike.com', expires: now() + 3600 })])
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'valid')
	})

	it('returns valid when all critical cookies have future expiration', async () => {
		await write(allCritical())
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'valid')
		assert.ok(result.lastLogin instanceof Date)
		assert.ok(typeof result.domainCount === 'number' && result.domainCount >= 3)
		assert.ok(typeof result.expiresAt === 'number' && result.expiresAt > 0)
	})

	it('returns valid when critical cookies have expires=-1 (non-expiring session cookies)', async () => {
		await write(allCritical().map((c) => ({ ...c, expires: -1 })))
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'valid')
	})

	it('returns expired when no sid cookie is present', async () => {
		await write([cookie({ name: 'cf_clearance', domain: 'accounts.nike.com', expires: now() + 86400 })])
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'expired')
	})

	it('returns expired when sid has leading-dot domain and is expired', async () => {
		const cookies = allCritical()
		cookies[0] = cookie({ name: 'sid', domain: '.accounts.nike.com', expires: now() - 3600 })
		await write(cookies)
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'expired')
	})

	it('returns valid when sid has leading-dot domain (.accounts.nike.com) and is not expired', async () => {
		const cookies = allCritical()
		cookies[0] = cookie({ name: 'sid', domain: '.accounts.nike.com', expires: now() + 3600 })
		await write(cookies)
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'valid')
	})

	it('returns expired (not TypeError) when cookie array contains null items', async () => {
		await writeFile(FILE, JSON.stringify([null, { name: 'cf_clearance', domain: '.nike.com', expires: now() + 86400 }]), 'utf8')
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'expired')
	})

	it('counts unique domains in domainCount', async () => {
		await write([
			...allCritical(),
			cookie({ name: 'cf_clearance', domain: 'accounts.nike.com', expires: now() + 86400 }),
		])
		const result = await validateSession(ID, SESSIONS_DIR)
		assert.equal(result.status, 'valid')
		assert.ok((result.domainCount ?? 0) >= 3)
	})
})
