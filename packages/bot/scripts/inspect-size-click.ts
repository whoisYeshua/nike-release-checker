// Verify which click strategy actually selects an EU 42 size on Nike FR PDP
import { createRealCheckoutContext } from '../src/stealth/realCheckoutContext.ts'

const URL = 'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-homme-jBrhdR/CW2288-111'

const handle = await createRealCheckoutContext({ accountId: 'candid_audio', headless: false })
const page = handle.context.pages()[0] ?? (await handle.context.newPage())

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
const cookieBtn = page.locator('[data-testid="modal-decline-button"], [data-testid="modal-accept-button"]').first()
if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click().catch(() => {})
await page.waitForTimeout(800)
await page.evaluate(() => window.scrollTo(0, 800))
await page.waitForSelector('[data-testid="pdp-grid-selector-item"]', { timeout: 15000 })

console.log('\n=== ELEMENT STRUCTURE for EU 42 ===')
const struct = await page.evaluate(() => {
	const items = document.querySelectorAll('[data-testid="pdp-grid-selector-item"]')
	for (const el of items) {
		if ((el.textContent ?? '').trim() === 'EU 42') {
			const parent = el.parentElement
			return {
				tagName: el.tagName,
				className: el.className,
				role: el.getAttribute('role'),
				ariaSelected: el.getAttribute('aria-selected'),
				clickable: el.hasAttribute('onclick') || (el as HTMLElement).style.pointerEvents !== 'none',
				outerHTML: el.outerHTML.slice(0, 400),
				parentTag: parent?.tagName,
				parentRole: parent?.getAttribute('role'),
				children: Array.from(el.children).map((c) => ({ tag: c.tagName, name: c.getAttribute('name'), type: c.getAttribute('type'), id: c.id })),
			}
		}
	}
	return null
})
console.log(JSON.stringify(struct, null, 2))

console.log('\n=== TEST CLICK STRATEGIES ===')
// Find the EU 42 item using regex (proven working)
const eu42 = page.locator('[data-testid="pdp-grid-selector-item"]').filter({ hasText: /^\s*EU\s+42\s*$/ }).first()

// Strategy 1: plain click
console.log('[strategy 1] plain locator.click()...')
await eu42.click({ timeout: 3000 }).catch((e) => console.log(`  err: ${e.message.slice(0,80)}`))
await page.waitForTimeout(800)
let isSelected = await page.evaluate(() => {
	const items = document.querySelectorAll('[data-testid="pdp-grid-selector-item"]')
	for (const el of items) {
		if ((el.textContent ?? '').trim() === 'EU 42') {
			return {
				ariaSelected: el.getAttribute('aria-selected'),
				ariaChecked: el.getAttribute('aria-checked'),
				className: el.className,
				selected: el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true',
			}
		}
	}
	return null
})
console.log(`  → ${JSON.stringify(isSelected)}`)

// Strategy 2: click child input if present
console.log('\n[strategy 2] click child input[type=radio]...')
await page.evaluate(() => {
	const items = document.querySelectorAll('[data-testid="pdp-grid-selector-item"]')
	for (const el of items) {
		if ((el.textContent ?? '').trim() === 'EU 42') {
			const input = el.querySelector('input')
			if (input) (input as HTMLInputElement).click()
			break
		}
	}
})
await page.waitForTimeout(800)
isSelected = await page.evaluate(() => {
	const items = document.querySelectorAll('[data-testid="pdp-grid-selector-item"]')
	for (const el of items) {
		if ((el.textContent ?? '').trim() === 'EU 42') {
			const input = el.querySelector('input') as HTMLInputElement | null
			return {
				inputChecked: input?.checked,
				ariaSelected: el.getAttribute('aria-selected'),
				className: el.className,
			}
		}
	}
	return null
})
console.log(`  → ${JSON.stringify(isSelected)}`)

// Strategy 3: check ATB button enables after selection
console.log('\n[strategy 3] check ATB button state after click...')
const atbBtn = page.locator('[data-testid="atb-button"]').first()
const atbEnabled = await atbBtn.isEnabled().catch(() => false)
const atbText = await atbBtn.textContent().catch(() => '')
console.log(`  ATB enabled=${atbEnabled} text="${atbText?.trim()}"`)

await page.waitForTimeout(15000)
await handle.close()
