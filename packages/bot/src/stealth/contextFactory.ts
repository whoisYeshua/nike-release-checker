// contextFactory — thin wrapper around launchRealChrome (patchright + system Chrome).
//
// Historical note: this file used to drive playwright-extra + puppeteer-extra-plugin-stealth
// against bundled Chromium. Both are now removed because they cannot mask Kasada's
// Runtime.enable probe; everything goes through patchright's launchPersistentContext
// instead. We keep the createStealthContext name + signature so the rest of the
// codebase (checkoutContext, tests) doesn't need to be touched.
import type { BrowserContext } from 'playwright'
import { launchRealChrome, type RealChromeHandle } from './realChrome.ts'

export interface StealthContextOptions {
	proxy?: string  // Full URL: http://user:pass@host:port — forwarded to launchRealChrome
	headless?: boolean  // Default: true
	locale?: string  // Default: 'fr-FR'
	timezone?: string  // Default: 'Europe/Paris'
	accountId?: string  // Optional — when set, uses ~/.nike-bot/profiles/{id}
}

// We carry the full RealChromeHandle on the returned BrowserContext so that
// callers (and the close handler we register below) can release the underlying
// patchright context cleanly. The wrapper is invisible to consumers — they just
// see a normal BrowserContext.
const handles = new WeakMap<BrowserContext, RealChromeHandle>()

/**
 * Creates a stealth-hardened BrowserContext backed by patchright + system Chrome.
 *
 * CREATE-USE-DESTROY PATTERN — the caller MUST call context.close() in a finally:
 *
 *   const context = await createStealthContext({ accountId, headless: false })
 *   try { … } finally { await context.close() }
 *
 * NEVER pool contexts. NEVER reuse a context across accounts.
 *
 * @param options.proxy   — currently unused (the stealth path goes through the
 *                          system Chrome profile; per-context proxy needs a
 *                          patchright extension we haven't wired yet). The
 *                          field is preserved so callers don't break; see
 *                          docs/code_source.md when wiring it in.
 */
export async function createStealthContext(
	options: StealthContextOptions = {},
): Promise<BrowserContext> {
	const handle = await launchRealChrome({
		headless: options.headless ?? true,
		...(options.locale !== undefined ? { locale: options.locale } : {}),
		...(options.timezone !== undefined ? { timezone: options.timezone } : {}),
		...(options.accountId !== undefined ? { accountId: options.accountId } : {}),
		...(options.proxy ? { proxy: options.proxy } : {}),
	})

	const ctx = handle.context
	handles.set(ctx, handle)

	// Patch close() so it tears down the patchright handle too.
	const originalClose = ctx.close.bind(ctx)
	ctx.close = async (closeOpts?: Parameters<typeof originalClose>[0]) => {
		const h = handles.get(ctx)
		handles.delete(ctx)
		try {
			await originalClose(closeOpts)
		} finally {
			if (h) await h.close().catch(() => undefined)
		}
	}

	return ctx
}
