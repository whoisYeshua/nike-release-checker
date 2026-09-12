import { createRealCheckoutContext } from '../src/stealth/realCheckoutContext.ts'

const URL = 'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-homme-jBrhdR/CW2288-111'
const SIZE_GRID = '[data-testid="pdp-grid-selector-item"]'
const SIZE_BUTTON = '[data-testid="pdp-grid-selector-item"]:text-is("EU 42")'

const t = (label: string, t0: number) => console.log(`[${label}] ${Date.now() - t0}ms`)

const t0 = Date.now()
console.log('[start] creating real checkout context...')
const handle = await createRealCheckoutContext({ accountId: 'candid_audio', headless: false })
t('context-ready', t0)

const page = handle.context.pages()[0] ?? (await handle.context.newPage())
t('page-ready', t0)

const tg = Date.now()
const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
console.log(`[goto] ${Date.now() - tg}ms — status=${response?.status()}`)
t('after-goto', t0)

const tc = Date.now()
const cookieBtn = page.locator('[data-testid="modal-decline-button"], [data-testid="modal-accept-button"]').first()
if (await cookieBtn.isVisible().catch(() => false)) {
	await cookieBtn.click().catch(() => {})
}
console.log(`[cookie-consent] ${Date.now() - tc}ms`)

const ts = Date.now()
await page.evaluate(() => window.scrollTo(0, 800)).catch(() => {})
await page.waitForTimeout(300)
console.log(`[scroll+wait] ${Date.now() - ts}ms`)

const tw = Date.now()
try {
	await page.waitForSelector(SIZE_GRID, { timeout: 15000, state: 'attached' })
	console.log(`[wait-selector ATTACHED] ${Date.now() - tw}ms — count=${await page.locator(SIZE_GRID).count()}`)
} catch (e) {
	console.log(`[wait-selector ATTACHED] FAILED ${Date.now() - tw}ms — ${(e as Error).message.slice(0, 200)}`)
}

const tw2 = Date.now()
try {
	await page.waitForSelector(SIZE_GRID, { timeout: 15000, state: 'visible' })
	console.log(`[wait-selector VISIBLE] ${Date.now() - tw2}ms`)
} catch (e) {
	console.log(`[wait-selector VISIBLE] FAILED ${Date.now() - tw2}ms — ${(e as Error).message.slice(0, 200)}`)
}

const tb = Date.now()
const btn = page.locator(SIZE_BUTTON)
const cnt = await btn.count()
const visible = await btn.first().isVisible().catch(() => false)
const enabled = await btn.first().isEnabled().catch(() => false)
console.log(`[size-button] ${Date.now() - tb}ms — count=${cnt} visible=${visible} enabled=${enabled}`)

console.log(`[total-pre-click] ${Date.now() - t0}ms`)
console.log('[done] keeping browser open 15s for visual inspection...')
await page.waitForTimeout(15000)
await handle.close()
