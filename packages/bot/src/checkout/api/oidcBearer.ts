// Extract the Nike OIDC Bearer token from the page's localStorage.
// Nike stores the OIDC session under keys matching `oidc.user:*` with shape
// { access_token: string | null, ... }. This module isolates the extraction
// so that cartApi.ts can stay focused on the cart request lifecycle.
//
// On failure throws SessionExpiredError — callers must NOT catch and swallow;
// let it propagate so withApiRetry can map it to outcome: 'session-expired'.

import type { Page } from 'playwright'
import { SessionExpiredError } from './apiErrors.ts'

/**
 * Read the OAuth Bearer token from the page's localStorage.
 *
 * Search strategy:
 *  1. Collect all localStorage keys that start with `oidc.user:`.
 *  2. For each, JSON-parse the value and return the first `access_token` that is
 *     a non-empty string.
 *  3. If none yields a token, throw `SessionExpiredError`.
 *
 * Note: The evaluate callback runs inside the browser JS context — no Node
 * globals are available. The return value is serialized by Playwright via
 * structured-clone (strings only, no Maps/functions).
 */
export async function getBearerToken(page: Page): Promise<string> {
	const result = await page.evaluate(() => {
		const keys = Object.keys(localStorage)
		const oidcKeys = keys.filter((k) => k.startsWith('oidc.user:'))
		if (oidcKeys.length === 0) {
			return { token: null as string | null, probedKeys: [] as string[] }
		}
		for (const key of oidcKeys) {
			let parsed: Record<string, unknown> | null = null
			try {
				const raw = localStorage.getItem(key)
				if (raw) {
					parsed = JSON.parse(raw) as Record<string, unknown>
				}
			} catch {
				// malformed JSON — try next key
			}
			const accessToken = parsed?.['access_token']
			if (typeof accessToken === 'string' && accessToken.length > 0) {
				return { token: accessToken, probedKeys: oidcKeys }
			}
		}
		return { token: null as string | null, probedKeys: oidcKeys }
	})

	if (!result.token) {
		const probed =
			result.probedKeys.length > 0
				? `probed keys: ${result.probedKeys.join(', ')}`
				: 'no oidc.user:* keys found in localStorage'
		throw new SessionExpiredError(`getBearerToken — ${probed}`)
	}

	return result.token
}
