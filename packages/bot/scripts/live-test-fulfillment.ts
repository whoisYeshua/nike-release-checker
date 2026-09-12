#!/usr/bin/env tsx
// live-test-fulfillment.ts — Story 12.4 integration script
//
// Usage: node --import tsx packages/bot/scripts/live-test-fulfillment.ts
//
// Bootstraps a real Chrome session, runs the full fulfillment sequence:
//   initVisitor → addItem → openShippingView (Stories 12.1 + 12.3)
//   → listOfferings → pickDefaultOffering → startPricingJob → waitForJob
//
// Prints wall time per step and priced offering details.
// Used to characterise FR shipping-method latency for NFR30 budget validation.

import { chromium } from 'playwright'
import { NikeCartApi } from '../src/checkout/api/cartApi.ts'
import { NikeCartViewsApi } from '../src/checkout/api/cartViewsApi.ts'
import { NikeFulfillmentApi, pickDefaultOffering } from '../src/checkout/api/fulfillmentApi.ts'
import { generateVisitorId } from '../src/checkout/api/visitorId.ts'
import type { NikeAddress } from '../src/checkout/api/cartViewsApi.types.ts'

// Air Force 1 FR SKU — update to a live/available SKU before running
const FR_SKU_ID = process.env['FR_SKU_ID'] ?? 'CW2288-111-9'
const SNKRS_URL = 'https://www.nike.com/fr/'

const FR_ADDRESS: NikeAddress = {
	recipient: { firstName: 'Jean', lastName: 'Dupont' },
	addressLines: ['12 Rue de Rivoli'],
	locality: 'Paris',
	postalCode: '75001',
	country: 'FR',
	phoneNumber: '+33612345678',
}

function lap(label: string, t0: number): number {
	const elapsed = Date.now() - t0
	console.log(`[live-test-fulfillment] ${label} — ${elapsed}ms`)
	return elapsed
}

async function main() {
	const browser = await chromium.launch({ headless: false })
	const context = await browser.newContext()
	const page = await context.newPage()

	console.log('[live-test-fulfillment] Navigating to Nike FR…')
	await page.goto(SNKRS_URL, { waitUntil: 'domcontentloaded' })

	const visitorId = generateVisitorId()
	const cartApi = new NikeCartApi(page, 'FR')
	const cartViewsApi = new NikeCartViewsApi(page)
	const fulfillmentApi = new NikeFulfillmentApi(page)

	// Step 1: initVisitor
	let t = Date.now()
	const cart = await cartApi.initVisitor(visitorId)
	lap(`initVisitor cartId=${cart.id}`, t)

	// Step 2: openShippingView + waitForView
	t = Date.now()
	const view = await cartViewsApi.openShippingView(cart.id, FR_ADDRESS)
	const readyView =
		view.status === 'READY'
			? view
			: await cartViewsApi.waitForView(view.viewId, { timeoutMs: 15_000, intervalMs: 250 })
	lap(`openShippingView+waitForView viewId=${readyView.viewId}`, t)

	// Step 3: listOfferings
	t = Date.now()
	const offerings = await fulfillmentApi.listOfferings({
		country: 'FR',
		currency: 'EUR',
		skuId: FR_SKU_ID,
	})
	lap(`listOfferings — ${offerings.length} offering(s)`, t)
	for (const o of offerings) {
		console.log(
			`  offering: offeringId=${o.offeringId} carrier=${o.carrier} type=${o.type}` +
				(o.cost ? ` cost=${o.cost.amount}${o.cost.currency}` : ''),
		)
	}

	// Step 4: pickDefaultOffering
	const chosen = pickDefaultOffering(offerings, 'FR', FR_SKU_ID)
	console.log(
		`[live-test-fulfillment] pickDefaultOffering → offeringId=${chosen.offeringId} carrier=${chosen.carrier}`,
	)

	// Step 5: startPricingJob
	t = Date.now()
	const job = await fulfillmentApi.startPricingJob({
		cartId: cart.id,
		offeringId: chosen.offeringId,
	})
	lap(`startPricingJob jobId=${job.jobId} status=${job.status}`, t)

	// Step 6: waitForJob
	t = Date.now()
	const completedJob = await fulfillmentApi.waitForJob(job.jobId, {
		timeoutMs: 8_000,
		intervalMs: 200,
	})
	lap(`waitForJob status=${completedJob.status}`, t)

	if (completedJob.pricedOffering) {
		const { totalCost, etaWindow } = completedJob.pricedOffering
		console.log(
			`[live-test-fulfillment] pricedOffering totalCost=${totalCost.amount}${totalCost.currency}` +
				(etaWindow ? ` eta=${etaWindow.earliest}→${etaWindow.latest}` : ''),
		)
	}

	await browser.close()
}

main().catch((err) => {
	console.error('[live-test-fulfillment] ERROR:', err)
	process.exit(1)
})
