#!/usr/bin/env tsx
// live-test-cart-views.ts — Story 12.3 integration script
//
// Usage: node --import tsx packages/bot/scripts/live-test-cart-views.ts
//
// Bootstraps a real Chrome session, initVisitor + addItem (Story 12.1),
// then openShippingView + waitForView and prints PENDING→READY latency.
// Used to characterise observed latency for tuning intervalMs defaults.

import { chromium } from 'playwright'
import { NikeCartApi } from '../src/checkout/api/cartApi.ts'
import { NikeCartViewsApi } from '../src/checkout/api/cartViewsApi.ts'
import { generateVisitorId } from '../src/checkout/api/visitorId.ts'
import type { NikeAddress } from '../src/checkout/api/cartViewsApi.types.ts'

const FR_ADDRESS: NikeAddress = {
	recipient: { firstName: 'Jean', lastName: 'Dupont' },
	addressLines: ['12 Rue de Rivoli'],
	locality: 'Paris',
	postalCode: '75001',
	country: 'FR',
	phoneNumber: '+33612345678',
}

const SNKRS_URL = 'https://www.nike.com/fr/'

async function main() {
	const browser = await chromium.launch({ headless: false })
	const context = await browser.newContext()
	const page = await context.newPage()

	console.log('[live-test-cart-views] Navigating to Nike FR…')
	await page.goto(SNKRS_URL, { waitUntil: 'domcontentloaded' })

	const visitorId = generateVisitorId()
	const cartApi = new NikeCartApi(page, 'FR')
	const cartViewsApi = new NikeCartViewsApi(page)

	console.log('[live-test-cart-views] initVisitor…')
	const cart = await cartApi.initVisitor(visitorId)
	console.log(`[live-test-cart-views] cartId=${cart.id}`)

	console.log('[live-test-cart-views] openShippingView…')
	const t0 = Date.now()
	const view = await cartViewsApi.openShippingView(cart.id, FR_ADDRESS)
	console.log(`[live-test-cart-views] view created: viewId=${view.viewId} status=${view.status}`)

	if (view.status !== 'READY') {
		console.log('[live-test-cart-views] Polling waitForView…')
		const ready = await cartViewsApi.waitForView(view.viewId, {
			timeoutMs: 15_000,
			intervalMs: 250,
		})
		const elapsed = Date.now() - t0
		console.log(
			`[live-test-cart-views] DONE status=${ready.status} elapsed=${elapsed}ms`,
		)
	} else {
		console.log(`[live-test-cart-views] READY immediately elapsed=${Date.now() - t0}ms`)
	}

	await browser.close()
}

main().catch((err) => {
	console.error('[live-test-cart-views] ERROR:', err)
	process.exit(1)
})
