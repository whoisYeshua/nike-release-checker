#!/usr/bin/env tsx
// live-test-payment-options.ts — Story 12.5 integration script
//
// Usage: node --import tsx packages/bot/scripts/live-test-payment-options.ts
//
// Bootstraps a real Chrome session with an account that has at least one stored card.
// Runs:
//   initVisitor → addItem → openShippingView (Stories 12.1, 12.3)
//   → listOptions → pickDefault → bindPaymentMethod → assert selectedPaymentMethod
//
// Redacts card last4 to ****<last4> in console output (NFR6: no PII in logs).
// Used to validate that test accounts have the expected card vault state.

import { chromium } from 'playwright'
import { NikeCartApi } from '../src/checkout/api/cartApi.ts'
import { NikeCartViewsApi } from '../src/checkout/api/cartViewsApi.ts'
import { NikePaymentApi, pickDefaultPaymentMethod } from '../src/checkout/api/paymentApi.ts'
import { generateVisitorId } from '../src/checkout/api/visitorId.ts'
import type { NikeAddress } from '../src/checkout/api/cartViewsApi.types.ts'
import type { PaymentMethod } from '../src/checkout/api/paymentApi.types.ts'

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

function redactPaymentMethod(m: PaymentMethod): Record<string, unknown> {
	return {
		methodId: m.methodId,
		type: m.type,
		displayLabel: m.displayLabel,
		brand: m.brand,
		last4: m.last4 ? `****${m.last4}` : undefined,
		isDefault: m.isDefault,
		expiresAt: m.expiresAt,
	}
}

function lap(label: string, t0: number): number {
	const elapsed = Date.now() - t0
	console.log(`[live-test-payment-options] ${label} — ${elapsed}ms`)
	return elapsed
}

async function main() {
	const browser = await chromium.launch({ headless: false })
	const context = await browser.newContext()
	const page = await context.newPage()

	console.log('[live-test-payment-options] Navigating to Nike FR…')
	await page.goto(SNKRS_URL, { waitUntil: 'domcontentloaded' })

	const visitorId = generateVisitorId()
	const cartApi = new NikeCartApi(page, 'FR')
	const cartViewsApi = new NikeCartViewsApi(page)
	const paymentApi = new NikePaymentApi(page)

	// Step 1: Init visitor and add item to cart
	let t0 = Date.now()
	console.log('[live-test-payment-options] initVisitor…')
	const cart = await cartApi.initVisitor(visitorId)
	lap('initVisitor', t0)

	t0 = Date.now()
	console.log(`[live-test-payment-options] addItem SKU=${FR_SKU_ID}…`)
	const updatedCart = await cartApi.addItem(cart.id, FR_SKU_ID, 1)
	lap('addItem', t0)
	console.log(`[live-test-payment-options] cartId=${updatedCart.id}`)

	// Step 2: Open shipping view (required before payment options)
	t0 = Date.now()
	console.log('[live-test-payment-options] openShippingView…')
	const shippingView = await cartViewsApi.openShippingView(updatedCart.id, FR_ADDRESS)
	lap('openShippingView', t0)
	console.log(`[live-test-payment-options] shippingViewId=${shippingView.viewId} status=${shippingView.status}`)

	// Step 3: Wait for shipping view READY
	t0 = Date.now()
	console.log('[live-test-payment-options] waitForView (shipping)…')
	const readyShipping = await cartViewsApi.waitForView(shippingView.viewId)
	lap('waitForView (shipping)', t0)
	console.log(`[live-test-payment-options] shipping status=${readyShipping.status}`)

	// Step 4: List payment options
	t0 = Date.now()
	console.log('[live-test-payment-options] listOptions…')
	const methods = await paymentApi.listOptions({ cartId: updatedCart.id, country: 'FR' })
	lap('listOptions', t0)

	if (methods.length === 0) {
		console.error('[live-test-payment-options] ⚠ No stored payment methods — account needs a card in vault.')
		console.error('[live-test-payment-options] Falling back to DOM Adyen flow (Story 12-7).')
		await browser.close()
		process.exit(1)
	}

	console.log(`[live-test-payment-options] Found ${methods.length} payment method(s):`)
	for (const m of methods) {
		console.log(' ', JSON.stringify(redactPaymentMethod(m)))
	}

	// Step 5: Pick default (prefer CARD)
	const chosen = pickDefaultPaymentMethod(methods, { prefer: 'CARD' })
	console.log(`[live-test-payment-options] Chosen: ${JSON.stringify(redactPaymentMethod(chosen))}`)

	// Step 6: Bind payment method to shipping view
	t0 = Date.now()
	console.log(`[live-test-payment-options] bindPaymentMethod viewId=${readyShipping.viewId} methodId=${chosen.methodId}…`)
	const updatedView = await paymentApi.bindPaymentMethod({
		viewId: readyShipping.viewId,
		methodId: chosen.methodId,
	})
	lap('bindPaymentMethod', t0)

	// Step 7: Assert
	const bound = (updatedView as Record<string, unknown>)['selectedPaymentMethod']
	if (bound !== chosen.methodId) {
		console.error(`[live-test-payment-options] ✗ FAIL: selectedPaymentMethod=${String(bound)} expected=${chosen.methodId}`)
		await browser.close()
		process.exit(1)
	}

	console.log(`[live-test-payment-options] ✓ PASS: selectedPaymentMethod=${String(bound)}`)
	await browser.close()
}

main().catch((err) => {
	console.error('[live-test-payment-options] Fatal error:', err)
	process.exit(1)
})
