// ⚠️⚠️⚠️  WARNING: REAL MONEY TEST — READ BEFORE RUNNING  ⚠️⚠️⚠️
//
// This test submits a REAL checkout on Nike.com. A real order will be placed
// and a real payment will be charged to the bound payment method.
//
// You MUST manually cancel the order immediately after the test in Nike's order
// management portal or the Nike SNKRS app.
//
// DOUBLE-GATED: BOTH environment variables must be set to 1.
//   RUN_LIVE_TESTS=1 AND RUN_LIVE_SUBMIT_TEST=1
//
// Usage:
//   RUN_LIVE_TESTS=1 RUN_LIVE_SUBMIT_TEST=1 node --test packages/bot/test/integration/checkoutsApi.live.test.ts
//
// Story 12.8, Task 8.

import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { NikeCheckoutsApi } from '../../src/checkout/api/checkoutsApi.ts'
import { NikeCartApi } from '../../src/checkout/api/cartApi.ts'
import { NikeCartViewsApi } from '../../src/checkout/api/cartViewsApi.ts'
import { NikeFulfillmentApi, pickDefaultOffering } from '../../src/checkout/api/fulfillmentApi.ts'
import { NikePaymentApi, pickDefaultPaymentMethod } from '../../src/checkout/api/paymentApi.ts'
import { NikeReviewApi } from '../../src/checkout/api/reviewApi.ts'
import { generateVisitorId } from '../../src/checkout/api/visitorId.ts'

// ─── Double gate ──────────────────────────────────────────────────────────────

const LIVE_TESTS = process.env['RUN_LIVE_TESTS'] === '1'
const SUBMIT_TEST = process.env['RUN_LIVE_SUBMIT_TEST'] === '1'

if (!LIVE_TESTS || !SUBMIT_TEST) {
	// Skip gracefully when not opted in.
	process.exit(0)
}

// ─── Live test ────────────────────────────────────────────────────────────────

describe('NikeCheckoutsApi LIVE submit — REAL ORDER', () => {
	let browser: Browser
	let page: Page

	before(async () => {
		browser = await chromium.launch({ headless: false })
		page = await browser.newPage()
	})

	after(async () => {
		await browser.close()
	})

	it('runs full hybrid pipeline through review and submits — asserts orderNumber returned', async () => {
		// This test requires a pre-authenticated Nike session (cookies loaded from disk
		// or via a login step not shown here). Configure NIKE_ACCOUNT_EMAIL and
		// NIKE_ACCOUNT_PASSWORD environment variables as needed by your auth flow.

		const cartApi = new NikeCartApi(page, 'FR', 'live-test-account')
		const visitorId = generateVisitorId()
		await cartApi.initVisitor(visitorId)

		// --- Replace STYLE_COLOR / SKU_ID with an available release for the live test ---
		const skuId = process.env['LIVE_TEST_SKU_ID'] ?? ''
		const styleColor = process.env['LIVE_TEST_STYLE_COLOR'] ?? ''
		const slug = process.env['LIVE_TEST_SLUG'] ?? ''
		assert.ok(skuId, 'LIVE_TEST_SKU_ID must be set')
		assert.ok(styleColor, 'LIVE_TEST_STYLE_COLOR must be set')
		assert.ok(slug, 'LIVE_TEST_SLUG must be set')

		const cart = await cartApi.addItem(skuId, slug, styleColor)

		const cartViewsApi = new NikeCartViewsApi(page)
		const shippingView = await cartViewsApi.openShippingView(cart.id, {
			recipient: { firstName: 'Test', lastName: 'User' },
			addressLines: [process.env['LIVE_TEST_ADDRESS_LINE1'] ?? '1 Test St'],
			locality: process.env['LIVE_TEST_CITY'] ?? 'Paris',
			postalCode: process.env['LIVE_TEST_ZIP'] ?? '75001',
			country: 'FR',
			phoneNumber: process.env['LIVE_TEST_PHONE'] ?? '+33600000000',
		})
		await cartViewsApi.waitForView(shippingView.viewId)

		const fulfillmentApi = new NikeFulfillmentApi(page)
		const offerings = await fulfillmentApi.listOfferings({ country: 'FR', currency: 'EUR', skuId })
		const offering = pickDefaultOffering(offerings, 'FR', skuId)
		const job = await fulfillmentApi.startPricingJob({ cartId: cart.id, offeringId: offering.offeringId })
		await fulfillmentApi.waitForJob(job.jobId)

		const paymentApi = new NikePaymentApi(page)
		const methods = await paymentApi.listOptions({ cartId: cart.id, country: 'FR', currency: 'EUR' })
		const method = pickDefaultPaymentMethod(methods, { prefer: 'CARD' })
		await paymentApi.bindPaymentMethod({ viewId: shippingView.viewId, methodId: method.methodId })

		const reviewApi = new NikeReviewApi(page)
		const review = await reviewApi.openReview({ cartId: cart.id })
		await reviewApi.waitForReview(review.reviewId)

		// ⚠️ THIS LINE PLACES A REAL ORDER — CANCEL IT IMMEDIATELY AFTER THE TEST
		const checkoutsApi = new NikeCheckoutsApi(page)
		const result = await checkoutsApi.submit(cart.id)

		console.log('⚠️  REAL ORDER PLACED — CANCEL NOW:', result.orderNumber)
		console.log('  orderId:', result.orderId)
		console.log('  status:', result.status)

		assert.ok(typeof result.orderNumber === 'string', 'orderNumber must be a string')
		assert.ok(result.orderNumber.length > 0, 'orderNumber must not be empty')
		assert.ok(['CONFIRMED', 'PENDING_3DS', 'PENDING'].includes(result.status), `unexpected status: ${result.status}`)
	})
})
