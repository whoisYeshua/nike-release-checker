import { describe, it, after, before } from 'node:test'
import { strict as assert } from 'node:assert'
import { stat, rm, mkdir, writeFile } from 'node:fs/promises'
import type { BrowserContext } from 'playwright'
import { captureCookies, persistCookies, loadCookies, injectCookies, loadAndInjectCookies } from './cookieStore.ts'
import type { CookieData } from './auth.types.ts'

const TEST_SESSIONS_DIR = '.bot-data-test-sessions'

function makeMockContext(cookies: CookieData[]): BrowserContext {
	return {
		cookies: async () => cookies,
	} as unknown as BrowserContext
}

const SAMPLE_COOKIES: CookieData[] = [
	{ name: '_abck', value: 'abc', domain: '.nike.com', path: '/', expires: -1, httpOnly: false, secure: true },
	{ name: 'sid', value: 'sessionid', domain: 'accounts.nike.com', path: '/', expires: -1, httpOnly: true, secure: true },
	{ name: 'KP_UIDz', value: 'uid', domain: 'api.nike.com', path: '/', expires: -1, httpOnly: true, secure: true },
	{ name: 'd_id', value: 'did', domain: '.paypal.com', path: '/', expires: -1, httpOnly: false, secure: true },
	{ name: 'irrelevant', value: 'x', domain: 'google.com', path: '/', expires: -1, httpOnly: false, secure: false },
	{ name: 'sub_nike', value: 'y', domain: 'sub.accounts.nike.com', path: '/', expires: -1, httpOnly: false, secure: true },
]

describe('captureCookies', () => {
	it('filters cookies to Nike and PayPal domains only', async () => {
		const result = await captureCookies(makeMockContext(SAMPLE_COOKIES))
		assert.ok(
			result.every((c) =>
				['.nike.com', 'accounts.nike.com', 'api.nike.com', '.paypal.com'].some(
					(d) => c.domain === d || c.domain.endsWith(d),
				),
			),
			'All returned cookies should be from allowed domains',
		)
		assert.ok(
			result.every((c) => c.domain !== 'google.com'),
			'google.com cookies must be excluded',
		)
	})

	it('includes cookies from .nike.com, accounts.nike.com, api.nike.com, .paypal.com', async () => {
		const result = await captureCookies(makeMockContext(SAMPLE_COOKIES))
		const domains = result.map((c) => c.domain)
		assert.ok(domains.includes('.nike.com'), 'should include .nike.com')
		assert.ok(domains.includes('accounts.nike.com'), 'should include accounts.nike.com')
		assert.ok(domains.includes('api.nike.com'), 'should include api.nike.com')
		assert.ok(domains.includes('.paypal.com'), 'should include .paypal.com')
	})

	it('includes subdomains that end with an allowed domain', async () => {
		const result = await captureCookies(makeMockContext(SAMPLE_COOKIES))
		const found = result.find((c) => c.domain === 'sub.accounts.nike.com')
		assert.ok(found, 'sub.accounts.nike.com should be included as it ends with .nike.com')
	})

	it('returns empty array when no cookies match', async () => {
		const result = await captureCookies(
			makeMockContext([
				{ name: 'foo', value: 'bar', domain: 'example.com', path: '/', expires: -1, httpOnly: false, secure: false },
			]),
		)
		assert.deepEqual(result, [])
	})
})

describe('persistCookies', () => {
	after(async () => {
		await rm(TEST_SESSIONS_DIR, { recursive: true, force: true })
	})

	const cookies: CookieData[] = [
		{ name: 'sid', value: 'abc', domain: 'accounts.nike.com', path: '/', expires: -1, httpOnly: true, secure: true },
	]

	it('writes cookies to the correct path', async () => {
		await persistCookies('test-account', cookies, TEST_SESSIONS_DIR)
		const s = await stat(`${TEST_SESSIONS_DIR}/test-account.json`)
		assert.ok(s.isFile(), 'cookie file should exist')
	})

	it('sets file permissions to 600', async () => {
		await persistCookies('perm-account', cookies, TEST_SESSIONS_DIR)
		const s = await stat(`${TEST_SESSIONS_DIR}/perm-account.json`)
		const mode = (s.mode & 0o777).toString(8)
		assert.equal(mode, '600', `Expected 600, got ${mode}`)
	})

	it('creates the sessions directory if it does not exist', async () => {
		const nestedDir = `${TEST_SESSIONS_DIR}/nested/deep`
		await persistCookies('nested-account', cookies, nestedDir)
		const s = await stat(`${nestedDir}/nested-account.json`)
		assert.ok(s.isFile(), 'cookie file should exist in nested directory')
	})
})

const TEST_LOAD_DIR = '.bot-data-test-load'

describe('loadCookies', () => {
	const sampleCookies: CookieData[] = [
		{ name: 'sid', value: 'tok', domain: 'accounts.nike.com', path: '/', expires: -1, httpOnly: true, secure: true },
	]

	before(async () => {
		await mkdir(TEST_LOAD_DIR, { recursive: true })
		await writeFile(
			`${TEST_LOAD_DIR}/valid-account.json`,
			JSON.stringify(sampleCookies),
			{ encoding: 'utf8', mode: 0o600 },
		)
		await writeFile(`${TEST_LOAD_DIR}/bad-json.json`, 'not json {{{', { encoding: 'utf8', mode: 0o600 })
		await writeFile(`${TEST_LOAD_DIR}/bad-structure.json`, JSON.stringify([{ x: 1 }]), {
			encoding: 'utf8',
			mode: 0o600,
		})
	})

	after(async () => {
		await rm(TEST_LOAD_DIR, { recursive: true, force: true })
	})

	it('returns parsed cookie array from a valid session file', async () => {
		const result = await loadCookies('valid-account', TEST_LOAD_DIR)
		assert.deepEqual(result, sampleCookies)
	})

	it('throws descriptive error when session file is missing', async () => {
		await assert.rejects(
			() => loadCookies('no-such-account', TEST_LOAD_DIR),
			(err: Error) => {
				assert.ok(err.message.includes('Session file missing'))
				assert.ok(err.message.includes('no-such-account'))
				return true
			},
		)
	})

	it('throws descriptive error when session file contains invalid JSON', async () => {
		await assert.rejects(
			() => loadCookies('bad-json', TEST_LOAD_DIR),
			(err: Error) => {
				assert.ok(err.message.includes('Session file corrupted'))
				assert.ok(err.message.includes('bad-json'))
				return true
			},
		)
	})

	it('throws descriptive error when session file has invalid structure', async () => {
		await assert.rejects(
			() => loadCookies('bad-structure', TEST_LOAD_DIR),
			(err: Error) => {
				assert.ok(err.message.includes('Session file corrupted'))
				return true
			},
		)
	})

	it('throws on empty string accountId', async () => {
		await assert.rejects(
			() => loadCookies('', TEST_LOAD_DIR),
			(err: Error) => {
				assert.ok(err.message.includes('Invalid account ID'))
				return true
			},
		)
	})

	it('throws on dot-only accountId', async () => {
		await assert.rejects(
			() => loadCookies('..', TEST_LOAD_DIR),
			(err: Error) => {
				assert.ok(err.message.includes('Invalid account ID'))
				return true
			},
		)
	})
})

describe('injectCookies', () => {
	const sampleCookies: CookieData[] = [
		{ name: '_abck', value: 'abc', domain: '.nike.com', path: '/', expires: -1, httpOnly: false, secure: true },
		{ name: 'sid', value: 'tok', domain: 'accounts.nike.com', path: '/', expires: -1, httpOnly: true, secure: true },
	]

	it('calls context.addCookies with the full cookie array', async () => {
		let captured: unknown[] = []
		const mockContext = {
			addCookies: async (c: unknown[]) => { captured = c },
		} as unknown as BrowserContext

		await injectCookies(mockContext, sampleCookies)
		assert.deepEqual(captured, sampleCookies)
	})

	it('does not call addCookies when cookie array is empty', async () => {
		let called = false
		const mockContext = {
			addCookies: async () => { called = true },
		} as unknown as BrowserContext

		await injectCookies(mockContext, [])
		assert.equal(called, false)
	})
})

describe('loadAndInjectCookies', () => {
	const sampleCookies: CookieData[] = [
		{ name: 'sid', value: 'tok', domain: 'accounts.nike.com', path: '/', expires: -1, httpOnly: true, secure: true },
	]
	const TMP_DIR = '.bot-data-test-inject'

	before(async () => {
		await mkdir(TMP_DIR, { recursive: true })
		await writeFile(
			`${TMP_DIR}/inject-acc.json`,
			JSON.stringify(sampleCookies),
			{ encoding: 'utf8', mode: 0o600 },
		)
	})

	after(async () => {
		await rm(TMP_DIR, { recursive: true, force: true })
	})

	it('loads and injects cookies in a single call', async () => {
		let captured: unknown[] = []
		const mockContext = {
			addCookies: async (c: unknown[]) => { captured = c },
		} as unknown as BrowserContext

		await loadAndInjectCookies(mockContext, 'inject-acc', TMP_DIR)
		assert.deepEqual(captured, sampleCookies)
	})

	it('propagates error when session file is missing', async () => {
		const mockContext = {
			addCookies: async () => {},
		} as unknown as BrowserContext

		await assert.rejects(
			() => loadAndInjectCookies(mockContext, 'ghost', TMP_DIR),
			(err: Error) => {
				assert.ok(err.message.includes('Session file missing'))
				return true
			},
		)
	})
})
