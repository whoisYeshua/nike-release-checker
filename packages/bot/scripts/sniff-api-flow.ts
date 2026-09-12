// Network sniffer: captures ALL XHR/fetch calls during a full PDP -> ATC -> checkout flow
// Output goes to packages/bot/scripts/api-trace.ndjson (one JSON line per call).
// Cookies/Bearer tokens are masked to last 8 chars.
import { writeFileSync, appendFileSync } from 'node:fs'
import { createRealCheckoutContext } from '../src/stealth/realCheckoutContext.ts'

const URL = 'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-homme-jBrhdR/CW2288-111'
const TRACE_FILE = './packages/bot/scripts/api-trace.ndjson'

const interestingHosts = [
	'api.nike.com',
	'www.nike.com',
	'unite.nikedev.com',
	'adyen.com',
	'live.adyen.com',
	'checkoutshopper-live.adyen.com',
]
const trackPaths = [
	'/buy/',
	'/orders/',
	'/cart',
	'/checkout',
	'/payment',
	'/cic/',
	'/idn/',
	'/oauth',
	'unite/oauth2',
]

writeFileSync(TRACE_FILE, '') // truncate

function mask(v?: string): string | undefined {
	if (!v) return v
	if (v.length < 16) return '***'
	return `***${v.slice(-8)}`
}

function shouldTrack(url: string): boolean {
	return interestingHosts.some((h) => url.includes(h)) &&
		trackPaths.some((p) => url.includes(p))
}

const handle = await createRealCheckoutContext({ accountId: 'candid_audio', headless: false })
const page = handle.context.pages()[0] ?? (await handle.context.newPage())

let count = 0
page.on('request', (req) => {
	const url = req.url()
	if (!shouldTrack(url)) return
	const headers = req.headers()
	const masked = {
		t: new Date().toISOString(),
		kind: 'req',
		method: req.method(),
		url,
		hasAuth: Boolean(headers['authorization']),
		auth: mask(headers['authorization']),
		ct: headers['content-type'],
		body: req.postData()?.slice(0, 800),
	}
	appendFileSync(TRACE_FILE, JSON.stringify(masked) + '\n')
	count++
})

page.on('response', async (res) => {
	const url = res.url()
	if (!shouldTrack(url)) return
	let body: string | undefined
	try {
		const ct = res.headers()['content-type'] ?? ''
		if (ct.includes('json') || ct.includes('text')) {
			body = (await res.text()).slice(0, 800)
		}
	} catch {}
	const masked = {
		t: new Date().toISOString(),
		kind: 'res',
		method: res.request().method(),
		url,
		status: res.status(),
		body,
	}
	appendFileSync(TRACE_FILE, JSON.stringify(masked) + '\n')
})

console.log(`[sniff] Tracing to ${TRACE_FILE}`)
console.log('[1] PDP...')
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
const cookieBtn = page.locator('[data-testid="modal-decline-button"], [data-testid="modal-accept-button"]').first()
if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click().catch(() => {})
await page.waitForTimeout(1500)
await page.evaluate(() => window.scrollTo(0, 800))
await page.waitForSelector('[data-testid="pdp-grid-selector-item"]', { timeout: 15000 })

console.log('[2] click EU 42...')
await page.evaluate(() => {
	const items = document.querySelectorAll('[data-testid="pdp-grid-selector-item"]')
	for (const el of items) {
		if ((el.textContent ?? '').trim() === 'EU 42') {
			const input = el.querySelector('input[type="radio"]') as HTMLInputElement | null
			input?.click()
			return
		}
	}
})
await page.waitForTimeout(1200)

console.log('[3] click ATB...')
await page.locator('[data-testid="atb-button"]').first().click().catch(() => {})
await page.waitForTimeout(3500)

console.log('[4] go cart...')
await page.goto('https://www.nike.com/fr/cart', { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(2500)

console.log('[5] go checkout...')
await page.goto('https://www.nike.com/fr/checkout', { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(4000)

console.log(`[done] captured ${count} req entries (plus responses). Browser open 20s for any extras...`)
await page.waitForTimeout(20000)
await handle.close()

console.log(`\n[output] ${TRACE_FILE}`)
console.log('Run:  rtk grep -E \'\\\\\"method\\\\\":|\\\\\"url\\\\\":\' ' + TRACE_FILE + ' | head -40')
