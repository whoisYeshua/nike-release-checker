/**
 * Manual live smoke test for KpsdkExtractor.
 *
 * USAGE (only run manually — NOT in CI):
 *   node --import tsx packages/bot/scripts/test-kpsdk-extract-live.ts --live
 *
 * What it does:
 *   1. Launches a real Chrome context (via createStealthContext)
 *   2. Loads a Nike PDP slug so p.js executes and KPSDK fingerprint is established
 *   3. Attaches KpsdkExtractor before navigation
 *   4. Waits 5 s for a protected request to fire (or falls back to forceFireProtectedRequest)
 *   5. Prints captured ct / v (truncated: first 4 chars + "..." + last 4 chars)
 *
 * Token values are truncated to avoid accidentally logging a valid token that
 * could be scraped from CI logs.
 */

import { createStealthContext } from '../src/stealth/contextFactory.ts'
import { getKpsdkExtractor } from '../src/stealth/kpsdk/extractor.ts'

const LIVE_FLAG = process.argv.includes('--live')

if (!LIVE_FLAG) {
	console.error('This script is for manual use only. Pass --live to run.')
	console.error('Example: node --import tsx packages/bot/scripts/test-kpsdk-extract-live.ts --live')
	process.exit(1)
}

const PDP_URL = 'https://www.nike.com/fr/launch/t/air-max-1-86-og-big-bubble'
const COUNTRY = 'FR'

function truncate(s: string): string {
	if (s.length <= 8) return s
	return `${s.slice(0, 4)}...${s.slice(-4)}`
}

async function run() {
	console.log('[kpsdk-live] Launching Chrome context...')
	const context = await createStealthContext({ headless: true })
	try {
		const page = await context.newPage()

		// Attach extractor before navigation so the very first protected request is captured
		const extractor = getKpsdkExtractor(page, COUNTRY)
		console.log('[kpsdk-live] Extractor attached. Navigating to PDP...')

		await page.goto(PDP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
		console.log('[kpsdk-live] Page loaded. Waiting 5 s for protected requests...')

		await new Promise((r) => setTimeout(r, 5_000))

		console.log('[kpsdk-live] Calling getToken()...')
		const token = await extractor.getToken()

		if (!token) {
			console.log('[kpsdk-live] ❌ No token captured (null returned)')
		} else {
			console.log('[kpsdk-live] ✅ Token captured:')
			console.log(`  ct:          ${truncate(token.ct)}`)
			console.log(`  v:           ${truncate(token.v)}`)
			console.log(`  capturedAt:  ${token.capturedAt.toISOString()}`)
			console.log(`  source:      ${token.source}`)
		}
	} finally {
		await context.close()
	}
}

run().catch((err) => {
	console.error('[kpsdk-live] Fatal error:', err)
	process.exit(1)
})
