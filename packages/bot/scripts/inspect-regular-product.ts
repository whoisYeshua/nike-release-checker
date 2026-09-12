import { launchRealChrome } from '../src/stealth/realChrome.ts'

const URL = process.argv[2] ?? 'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-homme-jBrhdR/CW2288-111'

console.log(`[inspect-reg] Opening visible Chrome → ${URL}`)
const { context, close } = await launchRealChrome({ accountId: 'candid_audio', headless: false })
const page = context.pages()[0] ?? (await context.newPage())

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
console.log(`[inspect-reg] Final URL: ${page.url()}`)
console.log(`[inspect-reg] Title: ${await page.title()}`)

await page.waitForTimeout(3000)

// Cookie consent
const cookieBtn = page.locator('[data-testid="modal-decline-button"], [data-testid="modal-accept-button"]').first()
if (await cookieBtn.isVisible().catch(() => false)) {
	await cookieBtn.click().catch(() => {})
	await page.waitForTimeout(500)
}

console.log('\n=== SIZE GRID CANDIDATES ===')
for (const sel of [
	'button[data-qa="size-dropdown"]',
	'[data-testid="pdp-grid-selector-item"]',
	'[data-testid="pdp-size-grid-item"]',
	'fieldset[aria-label*="aille"] label',
	'fieldset[aria-label*="aille"] input',
	'div[aria-roledescription="size"] button',
	'div[aria-label*="aille"] button',
	'button[role="radio"]',
	'[id^="skuAndSize-"]',
]) {
	const count = await page.locator(sel).count()
	console.log(`  ${sel.padEnd(60)} → ${count}`)
}

console.log('\n=== ATB BUTTON CANDIDATES ===')
for (const sel of [
	'[data-testid="atb-button"]',
	'button:has-text("Acheter")',
	'button:has-text("Ajouter au panier")',
	'button:has-text("Ajouter au sac")',
	'button[aria-label*="Acheter"]',
	'button[aria-label*="panier"]',
	'button[type="submit"]',
]) {
	const count = await page.locator(sel).count()
	console.log(`  ${sel.padEnd(60)} → ${count}`)
}

console.log('\n=== ALL BUTTONS WITH data-testid (first 30) ===')
const ids = await page.evaluate(() => {
	const btns = document.querySelectorAll('button[data-testid], a[data-testid][role="button"]')
	return Array.from(btns).slice(0, 30).map((b) => ({
		testid: b.getAttribute('data-testid'),
		text: (b.textContent ?? '').trim().slice(0, 50),
	}))
})
for (const i of ids) console.log(`  [${i.testid}]  "${i.text}"`)

console.log('\n=== SIZE-RELATED ELEMENTS (any tag) ===')
const sizes = await page.evaluate(() => {
	const els = document.querySelectorAll('[data-testid*="size" i], [aria-label*="aille" i], [aria-label*="size" i]')
	return Array.from(els).slice(0, 15).map((el) => ({
		tag: el.tagName.toLowerCase(),
		testid: el.getAttribute('data-testid'),
		ariaLabel: el.getAttribute('aria-label')?.slice(0, 50),
		text: (el.textContent ?? '').trim().slice(0, 40),
	}))
})
for (const s of sizes) console.log(`  <${s.tag}> testid=${s.testid} aria=${s.ariaLabel} text="${s.text}"`)

console.log('\n[inspect-reg] Browser stays open 30s for visual inspection...')
await page.waitForTimeout(30000)
await close()
