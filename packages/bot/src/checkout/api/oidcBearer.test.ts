import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import { getBearerToken } from './oidcBearer.ts'
import { SessionExpiredError } from './apiErrors.ts'

// ---------------------------------------------------------------------------
// Helpers — build a minimal fake Page whose page.evaluate returns a
// controlled localStorage snapshot. The evaluate callback runs in Node here,
// not in a browser, so we simulate the return value directly.
// ---------------------------------------------------------------------------

interface LocalStorageSpec {
	/** Map of key → raw value (already JSON-stringified if needed). */
	entries: Record<string, string>
}

/**
 * Build a fake Page whose page.evaluate() simulates localStorage access.
 *
 * getBearerToken's evaluate callback:
 *  1. Calls Object.keys(localStorage) to collect all keys
 *  2. Filters for keys starting with 'oidc.user:'
 *  3. Calls localStorage.getItem(key) for each match
 *  4. JSON.parses the value and reads access_token
 *
 * We replicate the *return value* of that evaluate call directly rather than
 * emulating a full DOM environment. This is safe because getBearerToken
 * only uses the evaluate return value (not any in-page side effects).
 */
function makePage(spec: LocalStorageSpec): Page {
	return {
		evaluate: async (_fn: unknown) => {
			// Replicate what the browser-side callback returns
			const keys = Object.keys(spec.entries)
			const oidcKeys = keys.filter((k) => k.startsWith('oidc.user:'))
			if (oidcKeys.length === 0) {
				return { token: null as string | null, probedKeys: [] as string[] }
			}
			for (const key of oidcKeys) {
				let parsed: Record<string, unknown> | null = null
				try {
					const raw = spec.entries[key]
					if (raw) {
						parsed = JSON.parse(raw) as Record<string, unknown>
					}
				} catch {
					// malformed JSON
				}
				const accessToken = parsed?.['access_token']
				if (typeof accessToken === 'string' && accessToken.length > 0) {
					return { token: accessToken, probedKeys: oidcKeys }
				}
			}
			return { token: null as string | null, probedKeys: oidcKeys }
		},
	} as unknown as Page
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getBearerToken', () => {
	it('returns access_token from a single oidc.user: key', async () => {
		const page = makePage({
			entries: {
				'oidc.user:https://accounts.nike.com:abc': JSON.stringify({
					access_token: 'token-abc-xyz',
					expires_at: 9999999,
				}),
			},
		})
		const token = await getBearerToken(page)
		assert.equal(token, 'token-abc-xyz')
	})

	it('returns the first valid token when multiple oidc.user: keys exist', async () => {
		const page = makePage({
			entries: {
				// First key has a valid token — must be returned
				'oidc.user:https://accounts.nike.com:key1': JSON.stringify({
					access_token: 'first-valid-token',
				}),
				'oidc.user:https://accounts.nike.com:key2': JSON.stringify({
					access_token: 'second-token',
				}),
			},
		})
		const token = await getBearerToken(page)
		// The first oidc.user: key with a non-null token is returned
		assert.equal(token, 'first-valid-token')
	})

	it('skips keys with null access_token and picks the next valid one', async () => {
		const page = makePage({
			entries: {
				'oidc.user:https://accounts.nike.com:key1': JSON.stringify({
					access_token: null,
				}),
				'oidc.user:https://accounts.nike.com:key2': JSON.stringify({
					access_token: 'valid-second',
				}),
			},
		})
		const token = await getBearerToken(page)
		assert.equal(token, 'valid-second')
	})

	it('throws SessionExpiredError when localStorage is empty', async () => {
		const page = makePage({ entries: {} })
		await assert.rejects(
			() => getBearerToken(page),
			(err: unknown) => {
				assert.ok(err instanceof SessionExpiredError)
				assert.match(err.message, /getBearerToken/)
				assert.match(err.message, /no oidc\.user:\* keys found/)
				return true
			},
		)
	})

	it('throws SessionExpiredError when only oidc.<hash> aliases exist (no oidc.user: keys)', async () => {
		const page = makePage({
			entries: {
				// These are NOT oidc.user: keys — just oidc.* aliases (hash style)
				'oidc.abc123': JSON.stringify({ access_token: 'should-not-be-returned' }),
				'oidc.def456': JSON.stringify({ access_token: 'also-not-returned' }),
			},
		})
		await assert.rejects(
			() => getBearerToken(page),
			(err: unknown) => {
				assert.ok(err instanceof SessionExpiredError)
				assert.match(err.message, /getBearerToken/)
				return true
			},
		)
	})

	it('throws SessionExpiredError when all oidc.user: keys have null access_token', async () => {
		const page = makePage({
			entries: {
				'oidc.user:https://accounts.nike.com:k1': JSON.stringify({ access_token: null }),
				'oidc.user:https://accounts.nike.com:k2': JSON.stringify({ access_token: null }),
			},
		})
		await assert.rejects(
			() => getBearerToken(page),
			(err: unknown) => {
				assert.ok(err instanceof SessionExpiredError)
				return true
			},
		)
	})

	it('throws SessionExpiredError when oidc.user: value is malformed JSON', async () => {
		const page = makePage({
			entries: {
				'oidc.user:https://accounts.nike.com:bad': 'not-valid-json{{{',
			},
		})
		await assert.rejects(
			() => getBearerToken(page),
			(err: unknown) => {
				assert.ok(err instanceof SessionExpiredError)
				return true
			},
		)
	})

	it('includes the probed key names in SessionExpiredError message', async () => {
		const page = makePage({
			entries: {
				'oidc.user:https://accounts.nike.com:failkey': JSON.stringify({
					access_token: null,
				}),
			},
		})
		await assert.rejects(
			() => getBearerToken(page),
			(err: unknown) => {
				assert.ok(err instanceof SessionExpiredError)
				assert.match(
					err.message,
					/oidc\.user:https:\/\/accounts\.nike\.com:failkey/,
				)
				return true
			},
		)
	})
})
