// Adds AF1 to cart, navigates to checkout, dumps shipping/payment form selectors.
import { createRealCheckoutContext } from '../src/stealth/realCheckoutContext.ts'
import { naturalClick } from '../src/checkout/naturalClick.ts'

const PDP = 'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-homme-jBrhdR/CW2288-111'

const handle = await createRealCheckoutContext({ accountId: 'candid_audio', headless: false })
const page = handle.context.pages()[0] ?? (await handle.context.newPage())

console.log('[1] PDP...')
await page.goto(PDP, { waitUntil: 'domcontentloaded', timeout: 15000 })
const cookieBtn = page.locator('[data-testid="modal-decline-button"], [data-testid="modal-accept-button"]').first()
if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click().catch(() => {})
await page.waitForTimeout(500)
await page.evaluate(() => window.scrollTo(0, 800))
await page.waitForSelector('[data-testid="pdp-grid-selector-item"]', { timeout: 15000, state: 'attached' })

console.log('[2] click EU 42...')
const eu42 = page.locator('[data-testid="pdp-grid-selector-item"]').filter({ hasText: /^\s*EU\s+42\s*$/ }).first()
await naturalClick(page, eu42)
await page.waitForTimeout(800)

console.log('[3] add to cart...')
await naturalClick(page, page.locator('[data-testid="atb-button"]').first())
await page.waitForTimeout(2000)

console.log('[4] go to checkout...')
await page.goto('https://www.nike.com/fr/checkout', { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(4000)

console.log('\n=== CHECKOUT PAGE — shipping/payment candidates ===')
console.log('URL:', page.url())
console.log('Title:', await page.title())

console.log('\n--- Buttons (data-testid + text) ---')
const btns = await page.evaluate(() => {
	const all = document.querySelectorAll('button')
	return Array.from(all).slice(0, 40).map((b) => ({
		testid: b.getAttribute('data-testid'),
		ariaLabel: b.getAttribute('aria-label')?.slice(0, 50),
		text: (b.textContent ?? '').trim().slice(0, 60),
		type: b.getAttribute('type'),
		disabled: b.disabled,
	})).filter(x => x.text || x.testid || x.ariaLabel)
})
for (const b of btns) console.log(`  [${b.testid ?? '-'}] type=${b.type} dis=${b.disabled} aria="${b.ariaLabel}" text="${b.text}"`)

console.log('\n--- Forms / addresses / payment indicators ---')
const probes = [
	'[data-testid*="ship"]',
	'[data-testid*="address"]',
	'[data-testid*="payment"]',
	'[data-testid*="pay-"]',
	'[data-testid*="continue"]',
	'[data-testid*="save"]',
	'h1, h2, h3',
	'fieldset',
]
for (const sel of probes) {
	const items = await page.evaluate((s) => {
		const els = document.querySelectorAll(s)
		return Array.from(els).slice(0, 6).map((e) => ({
			tag: e.tagName.toLowerCase(),
			testid: e.getAttribute('data-testid'),
			text: (e.textContent ?? '').trim().slice(0, 60),
		}))
	}, sel)
	if (items.length > 0) {
		console.log(`  ${sel}:`)
		for (const i of items) console.log(`    <${i.tag}> testid=${i.testid} text="${i.text}"`)
	}
}

console.log('\n[done] keep browser open 30s for visual inspection...')
await page.waitForTimeout(30000)
await handle.close()
