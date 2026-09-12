// Live integration test for NikeCartApi — gated behind RUN_LIVE_TESTS=1.
//
// Run:
//   RUN_LIVE_TESTS=1 NIKE_TEST_ACCOUNT=<accountId> NIKE_TEST_PDP=<pdp_url> \
//     NIKE_TEST_SKU=<skuId> NIKE_TEST_SLUG=<slug> NIKE_TEST_STYLE_COLOR=<style-color> \
//     node --import tsx --test packages/bot/test/integration/cartApi.live.test.ts
//
// Excluded from default `npm test` (different glob root).

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
	NikeCartApi,
	generateVisitorId,
} from '../../src/checkout/api/index.ts'
import { createRealCheckoutContext } from '../../src/stealth/realCheckoutContext.ts'

const LIVE = process.env.RUN_LIVE_TESTS === '1'

// Refuse any PDP URL whose hostname is not a Nike property — prevents a
// misconfigured CI env var from steering a real account session at an
// attacker-controlled host.
function assertNikeHost(rawUrl: string): URL {
	const url = new URL(rawUrl)
	if (!url.hostname.endsWith('.nike.com') && url.hostname !== 'nike.com') {
		throw new Error(
			`NIKE_TEST_PDP host ${url.hostname} is not under nike.com — refusing to load`,
		)
	}
	return url
}

describe('NikeCartApi (live)', { skip: !LIVE }, () => {
	it('initVisitor + addItem + getCart against api.nike.com FR', async () => {
		const accountId = process.env.NIKE_TEST_ACCOUNT
		const pdpUrl = process.env.NIKE_TEST_PDP
		const skuId = process.env.NIKE_TEST_SKU
		const slug = process.env.NIKE_TEST_SLUG
		const styleColor = process.env.NIKE_TEST_STYLE_COLOR
		assert.ok(
			accountId && pdpUrl && skuId && slug && styleColor,
			'Set NIKE_TEST_ACCOUNT, NIKE_TEST_PDP, NIKE_TEST_SKU, NIKE_TEST_SLUG, NIKE_TEST_STYLE_COLOR',
		)
		const validatedUrl = assertNikeHost(pdpUrl)

		const handle = await createRealCheckoutContext({
			accountId,
			headless: false,
		})
		try {
			const page =
				handle.context.pages()[0] ?? (await handle.context.newPage())

			// Bootstrap KPSDK by loading a real PDP first, then wait until the
			// OIDC token lands in localStorage (Nike's auth JS sets it async).
			// Story 12.10: replaced magic-number sleep with deterministic polling.
			await page.goto(validatedUrl.toString(), {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			})
			await page.waitForFunction(
				() => Object.keys(localStorage).some((k) => k.startsWith('oidc.user:')),
				{ timeout: 30000 },
			)

			// Pass accountId so ensureKpsdkToken() runs the cache-backed pre-flight
			// warm-up (Story 14.2) before each request — required for the 403 path
			// that Story 14.3 retry handles to even have a fighting chance.
			const api = new NikeCartApi(page, 'FR', accountId)

			const dump = async <T>(label: string, p: Promise<T>): Promise<T> => {
				try { return await p } catch (err) {
					console.error(`[live] ${label} failed:`, err instanceof Error ? err.message : err)
					if (err && typeof err === 'object' && 'bodyPreview' in err) {
						console.error(`[live] ${label} bodyPreview:`, (err as { bodyPreview: string }).bodyPreview)
					}
					throw err
				}
			}

			const cart0 = await dump('initVisitor', api.initVisitor(generateVisitorId()))
			console.error('[live] initVisitor OK — country=', cart0.country, 'items=', cart0.items.length)
			assert.equal(cart0.country, 'FR')

			const cart2 = await dump('getCart', api.getCart())
			console.error('[live] getCart OK — items=', cart2.items.length)

			// addItem may legitimately return 400 INVALID_QUANTITY if the test
			// account already holds the SKU's max — that's a server-side rate
			// limit, not a bot failure. We treat it as a soft skip.
			let cart1: typeof cart2 | undefined
			try {
				cart1 = await api.addItem(skuId, slug, styleColor, 1)
				console.error('[live] addItem OK — items=', cart1.items.length)
				const matching = cart1.items.filter((i) => i.skuId === skuId)
				assert.ok(matching.length >= 1)
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				const body = err && typeof err === 'object' && 'bodyPreview' in err
					? (err as { bodyPreview: string }).bodyPreview : ''
				if (body.includes('ITEM_QUANTITY_LIMIT') || body.includes('INVALID_QUANTITY')) {
					console.error('[live] addItem skipped — Nike account quantity limit reached (business state, not a bot failure):', body.slice(0, 120))
				} else {
					console.error('[live] addItem unexpected failure:', msg, body.slice(0, 200))
					throw err
				}
			}

			// Cleanup intentionally omitted — Nike's PATCH remove-op contract
			// does not match any RFC 6902 variation we have probed (returns
			// MISSING_REQUIRED on `value` and FIELD_INVALID on `value: null`,
			// `replace qty=0`, etc.). A follow-up story should capture a real
			// browser remove operation and align the JSON Patch shape.
			void cart1
		} finally {
			await handle.close()
		}
	})
})
