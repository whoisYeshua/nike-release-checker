import { createStealthContext, type StealthContextOptions } from './contextFactory.ts'
import { loadAndInjectCookies } from '../auth/cookieStore.ts'
import { loadSessionSnapshot, injectSessionSnapshot, completeOAuthHandshake } from '../auth/captureSession.ts'
import type { BrowserContext } from 'playwright'

export interface CheckoutContextOptions extends StealthContextOptions {
	accountId: string
}

// STANDARD CHECKOUT WORKFLOW (used in Epic 4):
//
//   import { createCheckoutContext } from '../stealth/checkoutContext.ts'
//
//   const context = await createCheckoutContext({ accountId: account.id, proxy: account.proxy })
//   try {
//     await selectSize(context, slug, size)
//     await addToCart(context)
//     await navigateCheckout(context)
//     await fillShipping(context, account)
//     await fillPayment(context, account)
//     await submitOrder(context)
//   } finally {
//     await context.close()  // ALWAYS in finally — even if checkout throws
//   }
//
// PARALLEL EXECUTION (never use Promise.all — use Promise.allSettled):
//
//   const results = await Promise.allSettled(
//     accounts.map(account =>
//       createCheckoutContext({ accountId: account.id, proxy: account.proxy })
//         .then(context => runCheckout(context, account))
//     )
//   )

/**
 * Creates a stealth browser context and injects the Nike session cookies for the given account.
 *
 * This is the STANDARD checkout context lifecycle used by Epic 4.
 *
 * Throws if no session file exists for the account (see loadCookies error messages).
 * The caller should catch this error and skip checkout for that account.
 *
 * @param options.accountId - The stored account UUID
 * @param options.proxy - Optional proxy URL (http://user:pass@host:port)
 * @param options.headless - Default: true
 * @param options.locale - Default: 'fr-FR'
 * @param options.timezone - Default: 'Europe/Paris'
 */
export async function createCheckoutContext(
	options: CheckoutContextOptions,
): Promise<BrowserContext> {
	const { accountId, ...stealthOptions } = options
	const context = await createStealthContext(stealthOptions)
	try {
		// Prefer full session snapshot (cookies + localStorage + sessionStorage).
		// Nike uses OIDC which stores access_token in localStorage — cookies alone
		// are not enough to authenticate against www.nike.com.
		// Falls back to cookies-only if no snapshot exists (backwards compatible).
		let useSnapshot = false
		try {
			const snapshot = await loadSessionSnapshot(accountId)
			await injectSessionSnapshot(context, snapshot)
			useSnapshot = true
		} catch {
			// No snapshot available — try cookies-only (legacy format)
			await loadAndInjectCookies(context, accountId)
		}

		// When using a snapshot, trigger the OAuth handshake so www.nike.com
		// sets its access_token. Without this, cookies are injected but the
		// user appears as "guest" on www.nike.com until visiting /fr/member.
		if (useSnapshot) {
			const page = await context.newPage()
			try {
				const authOk = await completeOAuthHandshake(page)
				if (!authOk) {
					console.warn(`  [auth] OAuth handshake failed for ${accountId} — session may be expired`)
				}
			} finally {
				await page.close()
			}
		}
		return context
	} catch (err) {
		// If injection fails for any reason, close the context immediately.
		// We do NOT want to leave orphaned browser contexts.
		// Suppress close() errors so the original error is always re-thrown.
		try { await context.close() } catch {}
		throw err
	}
}
