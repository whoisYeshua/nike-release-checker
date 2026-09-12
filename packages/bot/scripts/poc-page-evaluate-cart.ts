/**
 * POC: page.evaluate fetch vs page.request.fetch for Nike Cart API
 *
 * Hypothesis: running fetch() from within the page's JS context lets Kasada's
 * injected KPSDK script intercept the request and add valid x-kpsdk-cd/cr POW
 * headers — something page.request.fetch() bypasses (it goes straight to the
 * network layer, bypassing ServiceWorker / KPSDK intercept).
 *
 * Usage:
 *   node --import tsx packages/bot/scripts/poc-page-evaluate-cart.ts
 */

import { randomUUID } from 'node:crypto'
import { createRealCheckoutContext } from '../src/stealth/realCheckoutContext.ts'

const ACCOUNT_ID = 'candid_audio'
const PDP_URL =
	'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-ojDkV4tL/CW2288-111'
const SKU_ID = 'd0ca4bf1-a90c-5bdf-a518-997275341a24'
const SLUG = 'chaussure-air-force-1-07-pour-ojDkV4tL'
const STYLE_COLOR = 'CW2288-111'
const CART_PATCH_URL =
	'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY'

// ---- helpers ----------------------------------------------------------------

function log(label: string, data: unknown) {
	console.log(`\n${'='.repeat(60)}`)
	console.log(label)
	console.log('='.repeat(60))
	console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
}

function summarise(label: string, result: { status: number; headers: Record<string, string>; body: string }) {
	log(label, {
		status: result.status,
		kpsdk_r: result.headers['x-kpsdk-r'] ?? '(absent)',
		kpsdk_ct: result.headers['x-kpsdk-ct'] ?? '(absent)',
		authorization_present: 'authorization' in result.headers,
		set_cookie_present: 'set-cookie' in result.headers,
		body_preview: result.body.slice(0, 500),
		all_response_headers: result.headers,
	})
}

// ---- main -------------------------------------------------------------------

async function main() {
	console.log(`[POC] Launching real Chrome for account: ${ACCOUNT_ID}`)
	const handle = await createRealCheckoutContext({ accountId: ACCOUNT_ID, headless: false })

	const outgoing: Record<string, Record<string, string>> = {}

	try {
		const page = handle.context.pages()[0] ?? (await handle.context.newPage())

		// Intercept outgoing requests to capture what headers WE actually send
		page.on('request', (req) => {
			const url = req.url()
			if (url.includes('api.nike.com/buy/carts')) {
				const hdrs = req.headers()
				outgoing[url] = hdrs
				console.log(`\n[REQUEST INTERCEPTED] ${req.method()} ${url}`)
				console.log('  authorization:', hdrs['authorization'] ? `Bearer ***${hdrs['authorization'].slice(-8)}` : '(absent)')
				console.log('  x-kpsdk-cd:', hdrs['x-kpsdk-cd'] ?? '(absent)')
				console.log('  x-kpsdk-cr:', hdrs['x-kpsdk-cr'] ?? '(absent)')
				console.log('  x-kpsdk-ct:', hdrs['x-kpsdk-ct'] ?? '(absent)')
				console.log('  user-agent:', hdrs['user-agent'] ?? '(absent)')
			}
		})

		// Step 1: Navigate to PDP
		console.log(`\n[1] Navigating to PDP: ${PDP_URL}`)
		await page.goto(PDP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })

		// Step 2: Wait for KPSDK bootstrap
		console.log('[2] Waiting for KPSDK bootstrap (up to 6s)...')
		let kpsdkReady = false
		try {
			await page.waitForFunction(() => {
				const w = window as unknown as Record<string, unknown>
				return typeof w['KPSDK'] !== 'undefined'
			}, { timeout: 6_000 })
			kpsdkReady = true
			console.log('  KPSDK present in window')
		} catch {
			console.log('  KPSDK not found within 6s — proceeding with 3s sleep fallback')
			await new Promise((r) => setTimeout(r, 3_000))
		}

		// Also wait a bit extra so Nike's app JS finishes its auth init
		await new Promise((r) => setTimeout(r, 2_000))

		// Check Nike auth state in localStorage
		const authState = await page.evaluate(() => {
			const w = window as unknown as Record<string, unknown>
			const ls = w['localStorage'] as Storage
			const keys = Object.keys(ls)
			const oidcKeys = keys.filter((k) => k.startsWith('oidc.'))
			const accessToken = ls.getItem('access_token') ?? ls.getItem('nike_access_token')
			return {
				oidcKeys,
				hasAccessToken: !!accessToken,
				accessTokenPreview: accessToken ? `***${accessToken.slice(-8)}` : null,
			}
		})
		log('[Auth state in localStorage]', authState)

		// ── TEST A: page.evaluate() PATCH initVisitor ────────────────────────────
		console.log('\n\n[TEST A] page.evaluate() — PATCH initVisitor (visitorId merge)')
		const visitorId = randomUUID()
		const testABody = JSON.stringify([{ op: 'merge', path: '/', value: { visitorId } }])

		const testAResult = await page.evaluate(
			async ({ url, body }: { url: string; body: string }) => {
				const r = await fetch(url, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json-patch+json' },
					credentials: 'include',
					body,
				})
				const headersObj: Record<string, string> = {}
				r.headers.forEach((v, k) => { headersObj[k] = v })
				let bodyText = ''
				try { bodyText = await r.text() } catch { bodyText = '(stream error)' }
				return { status: r.status, headers: headersObj, body: bodyText.slice(0, 500) }
			},
			{ url: CART_PATCH_URL, body: testABody },
		)
		summarise('[TEST A RESULT] page.evaluate PATCH initVisitor', testAResult)

		// ── TEST B: page.evaluate() PATCH addItem ────────────────────────────────
		if (testAResult.status < 300) {
			console.log('\n\n[TEST B] page.evaluate() — PATCH addItem (op:add /items)')
			const testBBody = JSON.stringify([
				{
					op: 'add',
					path: '/items',
					value: {
						itemData: { url: `/fr/t/${SLUG}/${STYLE_COLOR}` },
						skuId: SKU_ID,
						quantity: 1,
					},
				},
			])

			const testBResult = await page.evaluate(
				async ({ url, body }: { url: string; body: string }) => {
					const r = await fetch(url, {
						method: 'PATCH',
						headers: { 'content-type': 'application/json-patch+json' },
						credentials: 'include',
						body,
					})
					const headersObj: Record<string, string> = {}
					r.headers.forEach((v, k) => { headersObj[k] = v })
					let bodyText = ''
					try { bodyText = await r.text() } catch { bodyText = '(stream error)' }
					return { status: r.status, headers: headersObj, body: bodyText.slice(0, 500) }
				},
				{ url: CART_PATCH_URL, body: testBBody },
			)
			summarise('[TEST B RESULT] page.evaluate PATCH addItem', testBResult)
		} else {
			console.log('\n[TEST B] Skipped — TEST A did not return 2xx')
		}

		// ── TEST C: page.request.fetch() PATCH initVisitor (current path) ────────
		console.log('\n\n[TEST C] page.request.fetch() — PATCH initVisitor (current impl)')
		const testCBody = JSON.stringify([{ op: 'merge', path: '/', value: { visitorId: randomUUID() } }])

		let testCResult: { status: number; headers: Record<string, string>; body: string }
		try {
			const resp = await page.request.fetch(CART_PATCH_URL, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json-patch+json' },
				data: testCBody,
			})
			const hdrs = resp.headers()
			let body = ''
			try { body = await resp.text() } catch { body = '(stream error)' }
			testCResult = { status: resp.status(), headers: hdrs, body: body.slice(0, 500) }
		} catch (err) {
			testCResult = { status: -1, headers: {}, body: String(err) }
		}
		summarise('[TEST C RESULT] page.request.fetch PATCH initVisitor', testCResult)

		// ── SUMMARY ──────────────────────────────────────────────────────────────
		console.log('\n\n' + '='.repeat(60))
		console.log('SUMMARY')
		console.log('='.repeat(60))
		console.log(`TEST A (page.evaluate PATCH initVisitor): ${testAResult.status}`)
		console.log(`  x-kpsdk-r in response: ${testAResult.headers['x-kpsdk-r'] ?? '(absent)'}`)
		console.log(`TEST C (page.request.fetch PATCH initVisitor): ${testCResult.status}`)
		console.log(`  x-kpsdk-r in response: ${testCResult.headers['x-kpsdk-r'] ?? '(absent)'}`)
		console.log(`\nKPSDK was ready: ${kpsdkReady}`)
		console.log('Outgoing cart requests intercepted:', Object.keys(outgoing).length)

		const verdict =
			testAResult.status >= 200 && testAResult.status < 300
				? '✅ VALIDATED — page.evaluate fetch() bypasses KPSDK block'
				: testAResult.status === 403 && testCResult.status === 403
				? '❌ BOTH 403 — KPSDK/Kasada blocks both paths; hypothesis invalidated'
				: `⚠️  AMBIGUOUS — evaluate=${testAResult.status}, request.fetch=${testCResult.status}`
		console.log(`\nVERDICT: ${verdict}`)

	} finally {
		await handle.close()
	}
}

main().catch((err) => {
	console.error('[POC] Fatal error:', err)
	process.exit(1)
})
