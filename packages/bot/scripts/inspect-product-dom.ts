import { launchRealChrome } from '../src/stealth/realChrome.ts'

const SLUG = process.argv[2] ?? 'air-max-90-base-grey-and-sport-royal'
const URL = `https://www.nike.com/fr/launch/t/${SLUG}`

console.log(`[inspect] Opening visible Chrome → ${URL}`)
const { context, close } = await launchRealChrome({ accountId: 'candid_audio', headless: false })
const page = context.pages()[0] ?? (await context.newPage())

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
console.log(`[inspect] Final URL: ${page.url()}`)
console.log(`[inspect] Title: ${await page.title()}`)

// Wait a bit for hydration
await page.waitForTimeout(3000)

// Dismiss cookie consent if present
const cookieBtn = page.locator('[data-testid="modal-decline-button"], [data-testid="modal-accept-button"]').first()
if (await cookieBtn.isVisible().catch(() => false)) {
	await cookieBtn.click().catch(() => {})
	await page.waitForTimeout(500)
}

console.log('\n=== SIZE GRID CANDIDATES ===')
const candidates = [
	'button[data-qa="size-dropdown"]',
	'[data-testid="pdp-grid-selector-item"]',
	'[data-testid="pdp-size-grid-item"]',
	'button[data-testid*="size"]',
	'fieldset[aria-label*="aille"] button',
	'select[name="skuAndSize"]',
	'.size-grid button',
]
for (const sel of candidates) {
	const count = await page.locator(sel).count()
	console.log(`  ${sel.padEnd(60)} → ${count} matches`)
}

console.log('\n=== ATB BUTTON CANDIDATES ===')
const atbCandidates = [
	'[data-testid="atb-button"]',
	'button:has-text("Acheter")',
	'button:has-text("Ajouter au panier")',
	'button:has-text("Ajouter au sac")',
	'button[aria-label*="Acheter"]',
	'button[type="submit"]',
]
for (const sel of atbCandidates) {
	const count = await page.locator(sel).count()
	console.log(`  ${sel.padEnd(60)} → ${count} matches`)
}

console.log('\n=== FIRST 3 BUTTON DATA-TESTIDS ===')
const ids = await page.evaluate(() => {
	const btns = document.querySelectorAll('button[data-testid]')
	return Array.from(btns).slice(0, 30).map((b) => ({
		testid: b.getAttribute('data-testid'),
		text: (b.textContent ?? '').trim().slice(0, 40),
	}))
})
for (const i of ids) {
	console.log(`  [${i.testid}]  "${i.text}"`)
}

console.log('\n[inspect] Browser stays open 25s for visual inspection...')
await page.waitForTimeout(25000)
await close()
