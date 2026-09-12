import type { BrowserContext } from 'playwright'
import { maskProxy } from '../logger/credentialMasker.ts'
import { normalizeProxyInput } from '../config/proxyNormalize.ts'

export { normalizeProxyInput }

export type ProxyTestResult =
	| { status: 'ok'; ip: string; latencyMs: number }
	| { status: 'error'; reason: string }

const ALLOWED_PROXY_SCHEMES = ['http:', 'https:', 'socks4:', 'socks5:']

/**
 * Tests proxy connectivity by loading a lightweight external URL.
 * Uses https://api.ipify.org?format=json to retrieve the exit IP address.
 *
 * The caller is responsible for passing a BrowserContext already configured with the proxy.
 * This function creates a page, navigates, and closes the page — it does NOT close the context.
 *
 * @param context - A stealth context configured with the proxy to test
 * @param testUrl - URL to fetch (default: https://api.ipify.org?format=json)
 */
export async function testProxy(
	context: BrowserContext,
	testUrl = 'https://api.ipify.org?format=json',
): Promise<ProxyTestResult> {
	let page: Awaited<ReturnType<typeof context.newPage>> | undefined
	const start = performance.now()
	try {
		page = await context.newPage()
		const response = await page.goto(testUrl, {
			timeout: 10_000,
			waitUntil: 'load',
		})
		if (!response?.ok()) {
			return {
				status: 'error',
				reason: `HTTP ${response?.status() ?? 'unknown'} from ${testUrl}`,
			}
		}
		let body: { ip?: unknown }
		try {
			body = (await response.json()) as { ip?: unknown }
		} catch {
			return {
				status: 'error',
				reason: `Non-JSON response from ${testUrl} (possible captcha or proxy interception)`,
			}
		}
		if (typeof body.ip !== 'string' || !body.ip) {
			return {
				status: 'error',
				reason: `Unexpected response shape from ${testUrl}: ${JSON.stringify(body)}`,
			}
		}
		const latencyMs = Math.round(performance.now() - start)
		return { status: 'ok', ip: body.ip, latencyMs }
	} catch (err) {
		return {
			status: 'error',
			reason: err instanceof Error ? err.message : String(err),
		}
	} finally {
		// Always close the page — the context remains open (caller's responsibility)
		await page?.close()
	}
}

/**
 * Parses a proxy URL string into Playwright BrowserContextOptions.proxy format.
 *
 * @param proxyUrl - Full proxy URL, e.g. http://user:pass@host:port
 * @returns Object with server, username (optional), password (optional)
 * @throws if the URL is invalid, scheme is unsupported, or hostname is missing
 *
 * @example
 * parseProxyUrl('http://admin:secret@proxy.example.com:8080')
 * // → { server: 'http://proxy.example.com:8080', username: 'admin', password: 'secret' }
 *
 * parseProxyUrl('http://proxy.example.com:8080')
 * // → { server: 'http://proxy.example.com:8080' }
 */
export function parseProxyUrl(proxyUrl: string): {
	server: string
	username?: string
	password?: string
} {
	const normalized = normalizeProxyInput(proxyUrl)
	let url: URL
	try {
		url = new URL(normalized)
	} catch {
		throw new Error(`parseProxyUrl: invalid proxy URL: ${maskProxy(proxyUrl)}`)
	}
	if (!ALLOWED_PROXY_SCHEMES.includes(url.protocol)) {
		throw new Error(
			`parseProxyUrl: unsupported scheme '${url.protocol}' in '${maskProxy(proxyUrl)}'. Allowed: ${ALLOWED_PROXY_SCHEMES.join(', ')}`,
		)
	}
	if (!url.hostname) {
		throw new Error(`parseProxyUrl: missing hostname in proxy URL: ${maskProxy(proxyUrl)}`)
	}
	// Use explicit port if provided; fall back to scheme defaults to avoid trailing colon
	const port =
		url.port ||
		(url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : null)
	if (!port) {
		throw new Error(
			`parseProxyUrl: missing port in proxy URL (required for ${url.protocol}): ${maskProxy(proxyUrl)}`,
		)
	}
	// url.username/password are percent-encoded — decode so credentials with
	// special chars round-trip correctly to setHTTPCredentials.
	const decode = (s: string): string => {
		try { return decodeURIComponent(s) } catch { return s }
	}
	return {
		server: `${url.protocol}//${url.hostname}:${port}`,
		username: url.username ? decode(url.username) : undefined,
		password: url.password ? decode(url.password) : undefined,
	}
}

/**
 * Masks proxy credentials for safe logging.
 * Delegates to the credential masker — wraps it under the stealth module's public API.
 */
export function maskProxyUrl(proxyUrl: string): string {
	return maskProxy(proxyUrl)
}

/**
 * Formats a proxy error with masked credentials for logging.
 *
 * @param accountId - The account identifier
 * @param proxyUrl - The proxy URL (credentials will be masked)
 * @param error - The error that occurred
 */
export function formatProxyError(accountId: string, proxyUrl: string, error: Error): string {
	return `[${accountId}] Proxy connection failed: ${maskProxy(proxyUrl)} — ${error.message}`
}
