// Test: load the captured session snapshot into a fresh Chrome and verify
// that we're authenticated on nike.com without re-prompting for credentials.
//
// What we look for:
//   - /fr/member loads (no redirect to login)
//   - the page contains "Compte" / user-menu / member email indicator
//   - sid cookie persists after navigation
//
// Run from packages/bot:
//   node --import tsx scripts/test-session-restore.mjs
import { launchRealChrome } from '../src/stealth/realChrome.ts'
import { loadSessionSnapshot, injectSessionSnapshot, completeOAuthHandshake } from '../src/auth/captureSession.ts'

const ACCOUNT = process.env.NIKE_TEST_ACCOUNT ?? 'demo_001'
console.log(`[restore] launching headed Chrome with profile=session-test for account=${ACCOUNT}`)

// Use a SEPARATE profile from the capture-session one — proves the session
// works via injected snapshot, not via the persistent cookie store.
const handle = await launchRealChrome({ accountId: 'session-test', headless: false })
let exitCode = 0
try {
  console.log('[restore] loading snapshot…')
  const snapshot = await loadSessionSnapshot(ACCOUNT)
  console.log(`        cookies=${snapshot.cookies.length}, localStorage origins=${Object.keys(snapshot.localStorage).length}`)

  console.log('[restore] injecting snapshot into context…')
  await injectSessionSnapshot(handle.context, snapshot)

  const page = handle.context.pages()[0] ?? await handle.context.newPage()

  console.log('[restore] running OAuth handshake on www.nike.com to materialize the session…')
  await completeOAuthHandshake(page).catch((e) => console.log('  handshake error:', e?.message ?? e))

  console.log('[restore] navigating to https://www.nike.com/fr/member')
  await page.goto('https://www.nike.com/fr/member', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(3_000)
  const finalUrl = page.url()
  console.log(`        final URL: ${finalUrl}`)

  // Inspect cookies after navigation.
  const cookies = await handle.context.cookies(['https://www.nike.com', 'https://accounts.nike.com'])
  const sid = cookies.find((c) => c.name === 'sid')
  const kp = cookies.filter((c) => c.name.startsWith('KP_UIDz'))
  console.log(`        sid cookie: ${sid ? '✓ present (domain ' + sid.domain + ')' : '✗ MISSING'}`)
  console.log(`        KP_UIDz cookies: ${kp.length} entries`)

  // Look at the page — connected pages contain a user menu or "Bienvenue".
  const text = await page.evaluate(() => document.body.innerText.slice(0, 800)).catch(() => '')
  const lower = text.toLowerCase()
  const isLoggedIn =
    finalUrl.includes('/fr/member') &&
    !finalUrl.includes('/login') &&
    !finalUrl.includes('/register') &&
    (lower.includes('bienvenue') || lower.includes('mon compte') || lower.includes('candid') || lower.includes('icloud'))

  if (isLoggedIn) {
    console.log('[restore] ✅ LOGGED IN — session restored successfully (no re-auth needed).')
  } else {
    console.log('[restore] ⚠ ambiguous result — page loaded but no clear "logged in" marker found.')
    console.log(`        body snippet: ${text.slice(0, 300)}`)
    exitCode = 1
  }
} catch (err) {
  console.error('[restore] error:', err?.message ?? err)
  exitCode = 1
} finally {
  console.log('[restore] closing Chrome (15s grace so you can see the result)…')
  await new Promise((r) => setTimeout(r, 15_000))
  await handle.close()
}
process.exit(exitCode)
