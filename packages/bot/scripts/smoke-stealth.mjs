// Smoke test for the new stealth pipeline (rebrowser-playwright + system Chrome).
//
// What this proves when it succeeds:
//   - rebrowser-playwright launchPersistentContext spawns Chrome cleanly.
//   - The hardened Chrome args + stealth init script don't crash the page.
//   - The Kasada warm-up on nike.com/fr completes and cookies (kpf/kpss) are set.
//   - /fr/register serves the login form (Kasada didn't block on arrival).
//
// What this does NOT prove:
//   - That Kasada won't block on actual submit. That needs a real account.
//
// Run from packages/bot WITH a visible window (recommended — Kasada fingerprints
// --headless=new even when the rest of the chain is clean):
//   node --import tsx scripts/smoke-stealth.mjs
//
// Headless variant is provided for CI smoke runs but will likely hang on Nike:
//   node --import tsx scripts/smoke-stealth.mjs --headless
import { launchRealChrome } from '../src/stealth/realChrome.ts'

const headless = process.argv.includes('--headless')

console.log(`[smoke] launching real Chrome (headless=${headless})...`)
// Random port in 9500-9599 to avoid colliding with stale Chrome instances.
const port = 9500 + Math.floor(Math.random() * 100)
const handle = await launchRealChrome({
  accountId: 'smoke-test',
  headless,
  port,
})

let exitCode = 0
try {
  // Don't reuse the initial about:blank page — Chrome --headless=new sometimes
  // tears it down right after connectOverCDP attaches. Always open our own.
  const page = await handle.context.newPage()

  console.log('[smoke] navigating to https://www.nike.com/fr (Kasada warmup)')
  const t1 = Date.now()
  await page.goto('https://www.nike.com/fr', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const homeTitle = await page.title()
  console.log(`  → loaded in ${Date.now() - t1}ms, title="${homeTitle}"`)
  await page.waitForTimeout(2_500)

  // Inspect Kasada cookies — kpf/kpss appear once the sensor has run.
  const cookies = await handle.context.cookies(['https://www.nike.com'])
  const kpf = cookies.find((c) => c.name === 'kpf')
  const kpss = cookies.find((c) => c.name === 'kpss')
  console.log(`  → kpf cookie:  ${kpf ? 'present' : 'MISSING'}`)
  console.log(`  → kpss cookie: ${kpss ? 'present' : 'MISSING'}`)

  // Probe the stealth fingerprint we just installed.
  const probe = await page.evaluate(() => ({
    webdriver: navigator.webdriver,
    languages: navigator.languages,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    pluginsLength: navigator.plugins.length,
    pluginsType: Object.prototype.toString.call(navigator.plugins),
    chromeRuntime: typeof window.chrome?.runtime,
    chromeLoadTimes: typeof window.chrome?.loadTimes,
    notificationPerm: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
    webglVendor: (() => {
      const c = document.createElement('canvas').getContext('webgl')
      if (!c) return 'no-webgl'
      return c.getParameter(37445)
    })(),
    webglRenderer: (() => {
      const c = document.createElement('canvas').getContext('webgl')
      if (!c) return 'no-webgl'
      return c.getParameter(37446)
    })(),
  }))
  console.log('[smoke] stealth fingerprint:')
  for (const [k, v] of Object.entries(probe)) console.log(`  ${k} = ${JSON.stringify(v)}`)

  console.log('[smoke] navigating to https://www.nike.com/fr/register (login form)')
  const t2 = Date.now()
  await page.goto('https://www.nike.com/fr/register', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  console.log(`  → loaded in ${Date.now() - t2}ms`)

  // Look for the email input. If Kasada blocked the navigation we'd be on a challenge
  // page or get a "parse error" before the form renders.
  const emailVisible = await page
    .waitForSelector('input[type="email"], input[name="emailAddress"], input#email', { timeout: 12_000, state: 'visible' })
    .then(() => true)
    .catch(() => false)

  if (emailVisible) {
    console.log('[smoke] ✅ login form rendered — Kasada did NOT block on arrival.')
  } else {
    console.log('[smoke] ❌ login form did NOT render — likely Kasada block or selector mismatch.')
    const url = page.url()
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '<unreadable>')
    console.log(`  current URL: ${url}`)
    console.log(`  body snippet: ${bodyText}`)
    exitCode = 1
  }
} catch (err) {
  console.error('[smoke] error:', err)
  exitCode = 1
} finally {
  console.log('[smoke] closing Chrome…')
  await handle.close()
}

process.exit(exitCode)
