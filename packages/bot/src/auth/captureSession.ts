import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import type { CookieData } from './auth.types.ts'

const DEFAULT_SESSIONS_DIR = '.bot-data/sessions'

/**
 * Complete Nike session snapshot — cookies + localStorage + sessionStorage.
 * Nike uses OIDC which stores access_token in localStorage (NOT cookies alone),
 * so we must capture all three to reproduce authentication.
 */
export interface SessionSnapshot {
  cookies: CookieData[]
  localStorage: Record<string, Record<string, string>>  // domain → key → value
  sessionStorage: Record<string, Record<string, string>>
  capturedAt: string
}

function sanitizeAccountId(accountId: string): string {
  const safeId = basename(accountId)
  if (!safeId || /^\.+$/.test(safeId)) {
    throw new Error(`Invalid account ID: '${accountId}'`)
  }
  return safeId
}

/**
 * Wait until the Nike `sid` cookie (on .accounts.nike.com) is present.
 * Nike's OAuth flow sets `sid` AFTER the user enters their password, and the
 * callback can take 15-60 seconds to complete. Pressing ENTER too early gives
 * an unauthenticated capture.
 *
 * Returns true if sid appeared within the timeout, false otherwise.
 */
export async function waitForNikeAuthCookie(
  context: BrowserContext,
  timeoutMs = 120_000,
  pollIntervalMs = 1000,
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const cookies = await context.cookies()
    const sid = cookies.find(
      (c) => c.name === 'sid' && (c.domain === '.accounts.nike.com' || c.domain === 'accounts.nike.com'),
    )
    if (sid) return true
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
  return false
}

/**
 * Capture the full authentication state from a live browser context.
 * Reads cookies from the context and localStorage/sessionStorage from
 * each Nike domain the user has touched.
 */
export async function captureFullSession(
  context: BrowserContext,
  page: Page,
): Promise<SessionSnapshot> {
  // 1. Capture all cookies
  const allCookies = await context.cookies()
  const NIKE_DOMAINS = ['.nike.com', 'www.nike.com', 'accounts.nike.com', '.accounts.nike.com', 'api.nike.com', '.api.nike.com']
  const cookies = allCookies.filter((c) =>
    NIKE_DOMAINS.some((d) => c.domain === d || c.domain.endsWith(d)),
  ) as CookieData[]

  // 2. Capture localStorage + sessionStorage from the main domains
  // We need to navigate to each domain separately to read its storage.
  const DOMAINS_TO_CAPTURE = ['https://www.nike.com/fr', 'https://accounts.nike.com/']
  const localStorage: Record<string, Record<string, string>> = {}
  const sessionStorage: Record<string, Record<string, string>> = {}

  for (const domainUrl of DOMAINS_TO_CAPTURE) {
    try {
      await page.goto(domainUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      const storage = await page.evaluate(() => {
        const ls: Record<string, string> = {}
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)
          if (key) ls[key] = window.localStorage.getItem(key) ?? ''
        }
        const ss: Record<string, string> = {}
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i)
          if (key) ss[key] = window.sessionStorage.getItem(key) ?? ''
        }
        return { origin: window.location.origin, ls, ss }
      })
      localStorage[storage.origin] = storage.ls
      sessionStorage[storage.origin] = storage.ss
    } catch (err) {
      // Domain unreachable — skip and continue
      console.warn(`[captureFullSession] Could not capture ${domainUrl}: ${err}`)
    }
  }

  return {
    cookies,
    localStorage,
    sessionStorage,
    capturedAt: new Date().toISOString(),
  }
}

/**
 * Persist a session snapshot to disk (mode 0o600).
 * Stored at {sessionsDir}/{accountId}.snapshot.json alongside the regular
 * cookies-only file for backwards compatibility.
 */
export async function persistSessionSnapshot(
  accountId: string,
  snapshot: SessionSnapshot,
  sessionsDir = DEFAULT_SESSIONS_DIR,
): Promise<void> {
  const safeId = sanitizeAccountId(accountId)
  await mkdir(sessionsDir, { recursive: true })
  const snapshotPath = join(sessionsDir, `${safeId}.snapshot.json`)
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), { encoding: 'utf8', mode: 0o600 })

  // Also write the plain cookies file for backwards compat with loadCookies()
  const cookiesPath = join(sessionsDir, `${safeId}.json`)
  await writeFile(cookiesPath, JSON.stringify(snapshot.cookies, null, 2), { encoding: 'utf8', mode: 0o600 })
}

/**
 * Load a previously captured session snapshot.
 * Throws if the snapshot file is missing or malformed.
 */
export async function loadSessionSnapshot(
  accountId: string,
  sessionsDir = DEFAULT_SESSIONS_DIR,
): Promise<SessionSnapshot> {
  const safeId = sanitizeAccountId(accountId)
  const snapshotPath = join(sessionsDir, `${safeId}.snapshot.json`)
  let raw: string
  try {
    raw = await readFile(snapshotPath, 'utf8')
  } catch {
    throw new Error(
      `Session snapshot missing for account '${accountId}'. Run 'nike-bot capture-session --account ${accountId}' to create it.`,
    )
  }
  const parsed = JSON.parse(raw) as SessionSnapshot
  if (!parsed.cookies || !parsed.localStorage) {
    throw new Error(`Session snapshot corrupt for account '${accountId}'.`)
  }
  return parsed
}

/**
 * Complete Nike's OAuth handshake using an injected session.
 *
 * After injecting cookies (sid, ua_state, did), www.nike.com itself doesn't yet
 * have the access_token — it's stored in localStorage via the OIDC callback.
 * To trigger the callback, we navigate to a protected page (/fr/member), which
 * redirects to accounts.nike.com/continue. If sid is valid, Nike shows a
 * "Continue as {name}" page — we click Continue, and Nike redirects back with
 * an OAuth code that www.nike.com exchanges for an access_token.
 *
 * This function MUST be called after injectSessionSnapshot() and BEFORE any
 * other navigation. On success, the browser is authenticated on www.nike.com.
 *
 * Returns true if the handshake succeeded (access_token now in localStorage).
 */
export async function completeOAuthHandshake(page: Page, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now()

  try {
    // Trigger the OAuth flow by visiting a protected page.
    // This redirects to accounts.nike.com/continue if sid is valid.
    await page.goto('https://www.nike.com/fr/member', {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })
    await page.waitForTimeout(2000)
  } catch {
    return false
  }

  // If we landed on accounts.nike.com/continue, click the Continue button.
  const url = page.url()
  if (url.includes('accounts.nike.com/continue')) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const t = (b.textContent || '').trim().toLowerCase()
        return t === 'continue' || t === 'continuer'
      })
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    if (!clicked) return false

    // Wait for redirect back to www.nike.com
    try {
      await page.waitForURL(/www\.nike\.com/, { timeout: timeoutMs - (Date.now() - start) })
    } catch {
      return false
    }
  }

  // Poll localStorage for oidc entries — the OAuth callback runs asynchronously
  // (exchanges code for access_token, then writes to localStorage). This can take
  // up to 10s on slow networks. Poll until oidc.* appears OR timeout.
  const pollDeadline = Date.now() + Math.max(5000, timeoutMs - (Date.now() - start))
  while (Date.now() < pollDeadline) {
    const authenticated = await page.evaluate(() => {
      if (!window.location.origin.includes('nike.com')) return false
      const oidcKeys = Object.keys(localStorage).filter((k) => k.startsWith('oidc.'))
      return oidcKeys.length > 0
    }).catch(() => false)
    if (authenticated) {
      // Wait for URL to settle (away from /auth/login?code=XXX intermediate state)
      // before returning. Otherwise the caller's navigation may interrupt the redirect.
      const settleDeadline = Date.now() + 5000
      while (Date.now() < settleDeadline) {
        const url = page.url()
        if (!url.includes('/auth/login?code=') && !url.includes('accounts.nike.com')) {
          break
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      // Wait for network to be idle before returning
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
      return true
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  return false
}

/**
 * Inject a full session snapshot into a fresh browser context.
 * Cookies go in via context.addCookies(), localStorage/sessionStorage via
 * addInitScript that runs on every page load.
 *
 * MUST be called BEFORE any navigation on the context.
 */
export async function injectSessionSnapshot(
  context: BrowserContext,
  snapshot: SessionSnapshot,
): Promise<void> {
  // 1. Cookies (synchronous inject into context)
  if (snapshot.cookies.length > 0) {
    await context.addCookies(snapshot.cookies)
  }

  // 2. localStorage + sessionStorage via addInitScript so they are present
  // on every page load for each origin. The script checks window.location.origin
  // and applies the right snapshot.
  const script = `
    (function () {
      var lsByOrigin = ${JSON.stringify(snapshot.localStorage)};
      var ssByOrigin = ${JSON.stringify(snapshot.sessionStorage)};
      var origin = window.location.origin;
      try {
        var ls = lsByOrigin[origin] || {};
        for (var k in ls) {
          if (Object.prototype.hasOwnProperty.call(ls, k)) {
            try { window.localStorage.setItem(k, ls[k]); } catch (e) {}
          }
        }
        var ss = ssByOrigin[origin] || {};
        for (var k in ss) {
          if (Object.prototype.hasOwnProperty.call(ss, k)) {
            try { window.sessionStorage.setItem(k, ss[k]); } catch (e) {}
          }
        }
      } catch (e) {}
    })();
  `
  await context.addInitScript(script)
}
