import { launchRealChrome, type RealChromeHandle } from './realChrome.ts'
import { loadSessionSnapshot, injectSessionSnapshot } from '../auth/captureSession.ts'

export interface RealCheckoutContextOptions {
  accountId: string
  headless?: boolean  // Default: true (headless during automated runs)
  port?: number  // Default: random in 9300-9400 range for parallel runs
  locale?: string
  timezone?: string
  proxy?: string  // Per-account proxy URL (http://user:pass@host:port) — exit IP for this account
}

/**
 * Launch a real Chrome (via CDP) for a specific account and prepare it for checkout.
 *
 * Key differences from createCheckoutContext:
 *   - Uses real Chrome spawned as an independent process (bypasses Kasada's Playwright detection)
 *   - Per-account persistent profile directory — auth state persists across runs
 *   - Automatically completes OAuth handshake if session snapshot exists
 *
 * WORKFLOW:
 *   const handle = await createRealCheckoutContext({ accountId: 'user@email.com' })
 *   try {
 *     const page = handle.context.pages()[0] ?? await handle.context.newPage()
 *     // run checkout steps on page
 *   } finally {
 *     await handle.close()  // ALWAYS in finally
 *   }
 *
 * PARALLEL EXECUTION:
 *   Each account gets its own Chrome process with its own userDataDir and debug port.
 *   Pass different `port` values per account to run in parallel.
 */
export async function createRealCheckoutContext(
  options: RealCheckoutContextOptions,
): Promise<RealChromeHandle> {
  const {
    accountId,
    headless = true,
    port = 9300 + Math.floor(Math.random() * 100),
    locale,
    timezone,
    proxy,
  } = options

  const handle = await launchRealChrome({
    accountId,
    headless,
    port,
    ...(locale ? { locale } : {}),
    ...(timezone ? { timezone } : {}),
    ...(proxy ? { proxy } : {}),
  })

  try {
    // Load and inject session snapshot. If no snapshot exists AND the profile
    // doesn't have auth cookies from a previous run, fail fast with a clear error.
    let injectedSnapshot = false
    try {
      const snapshot = await loadSessionSnapshot(accountId)
      await injectSessionSnapshot(handle.context, snapshot)
      injectedSnapshot = true
    } catch (err) {
      // No snapshot available — check if profile has a sid cookie from prior run.
      const existingCookies = await handle.context.cookies()
      const hasSid = existingCookies.some((c) => c.name === 'sid')
      if (!hasSid) {
        // Re-throw so the caller can return no_session
        throw err instanceof Error ? err : new Error(`Session snapshot missing for account '${accountId}'`)
      }
    }

    // Fast cookie-presence check INSTEAD of navigating to /fr/member for the full
    // OAuth handshake. The cookies (sid, oidc.*) injected from the snapshot are
    // sufficient for nike.com SPA auth on PDPs/cart — and `selectSize.ts`'s own
    // goto + assertNotBlocked will catch any auth issues. This skips 3-5s of
    // navigation overhead per checkout.
    if (injectedSnapshot) {
      // Read cookies straight from the context — no page needed. Touching the
      // initial about:blank page of a CDP-attached Chrome is unreliable (it can
      // be reaped by Chrome, leaving a dead handle the checkout pipeline then
      // trips over with "Target page, context or browser has been closed").
      // Nike sets `sid` on accounts.nike.com (not www.nike.com), so query both
      // origins to cover the full SPA + OAuth surface.
      const allCookies = await handle.context.cookies([
        'https://www.nike.com',
        'https://accounts.nike.com',
        'https://api.nike.com',
      ])
      const sidCookie = allCookies.find((c) => c.name === 'sid')
      const hasSid = Boolean(sidCookie)
      const hasOidc = allCookies.some((c) => c.name.startsWith('oidc.'))
      console.log(`  [auth] cookie check (multi-origin): sid=${hasSid}, oidc=${hasOidc}, total=${allCookies.length}`)
      if (!hasSid) {
        throw new Error(`Session snapshot missing for account '${accountId}'. Run 'nike-bot capture-session --account ${accountId}' to refresh.`)
      }
      // Fail fast (and clearly) if sid is present but EXPIRED — otherwise the
      // first protected API call 401s mid-checkout and surfaces as a generic
      // error after retry exhaustion, which is the worst time to discover it.
      const sidExpires = sidCookie?.expires
      if (typeof sidExpires === 'number' && sidExpires > 0 && sidExpires < Date.now() / 1000) {
        const when = new Date(sidExpires * 1000).toISOString()
        throw new Error(
          `Session for '${accountId}' has EXPIRED (sid expired ${when}). Run 'nike-bot capture-session --account ${accountId}' to refresh before the drop.`,
        )
      }
      // Fallback (original full OAuth handshake) — kept for reference if cookie
      // check turns out to be insufficient on some flows:
      // const authOk = await completeOAuthHandshake(page)
      // console.log(`  [auth] handshake returned: ${authOk}, page URL: ${page.url()}`)
      // const verify = await page.evaluate(() => ({
      //   oidc: Object.keys(localStorage).filter((k) => k.startsWith('oidc.')).length,
      //   origin: window.location.origin,
      // }))
      // console.log(`  [auth] localStorage check: origin=${verify.origin}, oidc=${verify.oidc}`)
      // if (!authOk) {
      //   console.warn(`  [auth] OAuth handshake failed for ${accountId} — session may be expired. Re-run capture-session.`)
      // }
    }

    return handle
  } catch (err) {
    // Clean up on failure
    try { await handle.close() } catch {}
    throw err
  }
}
