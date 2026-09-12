import { launchRealChrome } from '../src/stealth/realChrome.ts'

const URL = 'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-homme-jBrhdR/CW2288-111'
const { context, close } = await launchRealChrome({ accountId: 'candid_audio', headless: false })
const page = context.pages()[0] ?? (await context.newPage())
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(2500)
const cookieBtn = page.locator('[data-testid="modal-decline-button"], [data-testid="modal-accept-button"]').first()
if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click().catch(() => {})
await page.waitForTimeout(500)

const sizes = await page.evaluate(() => {
	const items = document.querySelectorAll('[data-testid="pdp-grid-selector-item"]')
	return Array.from(items).map((el) => ({
		text: (el.textContent ?? '').trim(),
		ariaLabel: el.getAttribute('aria-label'),
		ariaDisabled: el.getAttribute('aria-disabled'),
		disabled: (el as HTMLButtonElement).disabled,
	}))
})
console.log(`Found ${sizes.length} size buttons:`)
for (const s of sizes) console.log(`  text="${s.text.slice(0, 25)}"  aria-label="${s.ariaLabel?.slice(0, 50)}"  disabled=${s.disabled} aria-disabled=${s.ariaDisabled}`)

await close()
