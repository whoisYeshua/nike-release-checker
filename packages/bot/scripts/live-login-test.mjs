// Live end-to-end Kasada test — uses the real production stealth stack
// (patchright + system Chrome) to:
//   1. Warm up nike.com/fr (lets Kasada plant kpf/kpss).
//   2. Navigate to /fr/register.
//   3. Type a real email into the credential field.
//   4. Click Continue.
//   5. Race "password field appears" vs "Kasada error message appears".
//   6. Print the verdict + a screenshot path.
//
// We never submit a password — we only test whether Kasada lets us past the
// email step (which is exactly where login-all was failing in production).
//
// Run from packages/bot WITH a visible window (recommended):
//   node --import tsx scripts/live-login-test.mjs
//
// To use a custom email (defaults to the placeholder one in accounts.json):
//   NIKE_TEST_EMAIL='your@email.com' node --import tsx scripts/live-login-test.mjs

import { launchRealChrome } from '../src/stealth/realChrome.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_EMAIL = process.env.NIKE_TEST_EMAIL ?? 'candid_audio.0s@icloud.com'
const HEADLESS = process.argv.includes('--headless')
const SHOTS_DIR = join(tmpdir(), 'nike-live-test')
mkdirSync(SHOTS_DIR, { recursive: true })

console.log(`[live] launching real Chrome (headless=${HEADLESS}, email=${TEST_EMAIL.replace(/@.*/, '@***')})…`)

const handle = await launchRealChrome({ accountId: 'live-test', headless: HEADLESS })
let exitCode = 0
const t0 = Date.now()

try {
  const page = handle.context.pages()[0] ?? (await handle.context.newPage())
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a))
  const humanWait = () => page.waitForTimeout(rand(800, 1800))

  // -------- Step 1: warm up nike.com/fr (Kasada plants its cookies here) ----
  console.log('[live] [1/5] goto https://www.nike.com/fr (warmup, with mouse jitter)')
  const w0 = Date.now()
  await page.goto('https://www.nike.com/fr', { waitUntil: 'domcontentloaded', timeout: 45_000 })
  console.log(`        loaded in ${Date.now() - w0}ms — title="${await page.title().catch(() => '<closed>')}"`)
  // Random mouse movements — Kasada's sensor scores pointer entropy.
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(rand(100, 1700), rand(80, 800), { steps: rand(8, 20) })
    await page.waitForTimeout(rand(200, 700))
  }
  // Scroll down a bit then back, like a human would.
  await page.mouse.wheel(0, rand(300, 800))
  await page.waitForTimeout(rand(500, 1200))
  await page.mouse.wheel(0, -rand(150, 400))
  await page.waitForTimeout(rand(800, 1500))

  const cookiesAfterWarmup = await handle.context.cookies(['https://www.nike.com', 'https://accounts.nike.com'])
  const kpf = cookiesAfterWarmup.find((c) => c.name === 'kpf')
  const kpss = cookiesAfterWarmup.find((c) => c.name === 'kpss')
  console.log(`        kpf=${kpf ? '✓' : '✗'}  kpss=${kpss ? '✓' : '✗'}  total cookies=${cookiesAfterWarmup.length}`)

  // -------- Step 2: navigate to the Nike login page ------------------------
  console.log('[live] [2/5] goto https://www.nike.com/fr/login')
  const r0 = Date.now()
  await page.goto('https://www.nike.com/fr/login', { waitUntil: 'domcontentloaded', timeout: 45_000 })
  console.log(`        navigation finished in ${Date.now() - r0}ms — url=${page.url()}`)
  await humanWait()
  await page.screenshot({ path: join(SHOTS_DIR, '01-register.png') }).catch(() => {})

  // Wait for the email input. If Kasada blocks here we never see it.
  const emailSel = 'input[name="credential"]'
  const emailVisible = await page
    .waitForSelector(emailSel, { timeout: 20_000, state: 'visible' })
    .then(() => true)
    .catch(() => false)

  if (!emailVisible) {
    const url = page.url()
    const snippet = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '<unreadable>')
    console.log(`[live] ❌ email input never appeared. url=${url}`)
    console.log(`        body snippet: ${snippet}`)
    await page.screenshot({ path: join(SHOTS_DIR, '02-no-email-input.png') }).catch(() => {})
    exitCode = 1
    throw new Error('email-input-missing')
  }
  console.log('        email input visible ✓')

  // -------- Step 3: type the email like a human ---------------------------
  console.log(`[live] [3/5] click + type ${emailSel} like a human`)
  // Click on the input — gives focus and emits a real click sequence.
  const emailLocator = page.locator(emailSel)
  await emailLocator.scrollIntoViewIfNeeded()
  await page.waitForTimeout(rand(200, 500))
  // Hover to a random point inside the input first, then click.
  const box = await emailLocator.boundingBox()
  if (box) {
    await page.mouse.move(box.x + rand(10, Math.max(11, box.width - 10)), box.y + rand(5, Math.max(6, box.height - 5)), { steps: rand(15, 30) })
    await page.waitForTimeout(rand(80, 220))
    await page.mouse.down()
    await page.waitForTimeout(rand(40, 90))
    await page.mouse.up()
  } else {
    await emailLocator.click({ delay: rand(40, 100) })
  }
  await page.waitForTimeout(rand(300, 700))
  // Type character-by-character with realistic per-key delay.
  await page.keyboard.type(TEST_EMAIL, { delay: rand(60, 140) })
  await page.waitForTimeout(rand(400, 900))
  await page.screenshot({ path: join(SHOTS_DIR, '03-email-filled.png') }).catch(() => {})

  // -------- Step 4: click Continue with mouse movement -------------------
  console.log('[live] [4/5] move mouse + click Continue')
  const continueSel = 'button[type="submit"][aria-label="continue"]'
  const contLocator = page.locator(continueSel)
  const contBox = await contLocator.boundingBox()
  if (contBox) {
    await page.mouse.move(
      contBox.x + rand(10, Math.max(11, contBox.width - 10)),
      contBox.y + rand(5, Math.max(6, contBox.height - 5)),
      { steps: rand(20, 40) },
    )
    await page.waitForTimeout(rand(150, 400))
    await page.mouse.down()
    await page.waitForTimeout(rand(40, 100))
    await page.mouse.up()
  } else {
    await page.click(continueSel, { timeout: 5_000, delay: rand(40, 100) })
  }
  const c0 = Date.now()

  // -------- Step 3b: Nike redirects to accounts.nike.com/challenge-code which
  // defaults to emailing an OTP. Click "Utiliser le mot de passe" to switch
  // to the password field. Optional — Nike may route directly to password.
  await page.waitForTimeout(rand(800, 1500))
  const usePwSelectors = [
    'button:has-text("Utiliser le mot de passe")',
    'a:has-text("Utiliser le mot de passe")',
    '[role="button"]:has-text("Utiliser le mot de passe")',
    'button:has-text("Use password")',
    'a:has-text("Use password")',
  ]
  let clickedUsePw = false
  for (const sel of usePwSelectors) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log(`[live] [4b/5] clicking "Utiliser le mot de passe" (${sel})`)
      await loc.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(rand(600, 1100))
      clickedUsePw = true
      break
    }
  }
  if (!clickedUsePw) {
    console.log('[live] [4b/5] no "Utiliser le mot de passe" link visible — assuming direct password step')
  }
  await page.screenshot({ path: join(SHOTS_DIR, '04b-after-use-password.png') }).catch(() => {})

  // -------- Step 5: race password field vs error indicator ------------------
  // Nike's OAuth redirects through accounts.nike.com/challenge-code which can
  // take 5-10s to render the password step. 45s timeout accommodates that.
  console.log('[live] [5/5] waiting for password field OR Kasada error (up to 45s)…')
  const result = await Promise.race([
    page.waitForSelector('input[name="password"]', { timeout: 45_000, state: 'visible' })
      .then(() => 'password' /* success */).catch(() => null),
    page.waitForSelector('[role="alert"], [data-testid*="error"]', { timeout: 45_000 })
      .then(() => 'error' /* possibly Kasada */).catch(() => null),
  ])
  const elapsed = Date.now() - c0

  await page.screenshot({ path: join(SHOTS_DIR, '04-after-continue.png') }).catch(() => {})

  if (result === 'password') {
    console.log(`[live] ✅ PASSWORD FIELD APPEARED after ${elapsed}ms — Kasada did NOT block.`)
    console.log('       (We do not submit any real password — test ends here.)')
  } else if (result === 'error') {
    let errText = ''
    try {
      errText = (await page.textContent('[role="alert"]')) ?? ''
    } catch {}
    console.log(`[live] ❌ ERROR INDICATOR appeared after ${elapsed}ms.`)
    console.log(`       text: "${errText.trim().slice(0, 200)}"`)
    if (/erreur lors de l'analyse|access denied|kasada|akamai|blocked|forbidden/i.test(errText)) {
      console.log('       → classified as KASADA BLOCK')
    } else if (/utilisateur|email|incorrect|invalid|introuvable|not found/i.test(errText)) {
      console.log('       → classified as INVALID EMAIL (which is actually fine — means Kasada let us through!)')
    } else {
      console.log('       → unclassified error (see screenshot 04-after-continue.png)')
    }
    exitCode = 1
  } else {
    console.log(`[live] ❌ TIMEOUT — neither password field nor error after ${elapsed}ms.`)
    console.log(`       Likely Kasada silently froze the page. url=${page.url()}`)
    exitCode = 1
  }

  console.log(`[live] total elapsed: ${Date.now() - t0}ms`)
  console.log(`[live] screenshots saved to: ${SHOTS_DIR}`)
} catch (err) {
  if (err instanceof Error && err.message !== 'email-input-missing') {
    console.error('[live] uncaught error:', err.message)
  }
  exitCode ||= 1
} finally {
  await handle.close()
}
process.exit(exitCode)
