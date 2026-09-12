// errorToBlockReason — single lookup table mapping every typed error to a
// BlockReason. Epic 12 + orchestrator (Epic 11) consume this exclusively.
// NEVER propagate raw error.message into outcomes — use this function.
//
// Stories 12.2-12.8 will register their own error classes here as they land.
// See TODO markers below.
//
// Story 12.9.

import type { BlockReason } from '../../outcomes/blockReason.ts'
import {
	KpsdkBlockedError,
	RateLimitedError,
	ServerError,
	SessionExpiredError,
} from './apiErrors.ts'
import { NikeCartApiError } from './cartApi.ts'
import { KpsdkBlockedError as KpsdkFetchBlockedError } from '../../stealth/kpsdk/protectedFetch.js'
import { CartViewTimeoutError, CartViewError } from './cartViewsApi.ts'
import { FulfillmentJobTimeoutError, FulfillmentJobFailedError, NoFulfillmentOfferingError } from './fulfillmentApi.ts'
import { NoPaymentMethodError, PaymentApiAuthError } from './paymentApi.ts'
import { TotalMismatchError, ReviewTimeoutError, ReviewError } from './reviewApi.ts'
import { SkuNotFoundError, StyleColorNotFoundError } from './skuResolver.ts'
import { CheckoutKpsdkBlockedError, CheckoutServerError, CheckoutDeclinedError } from './checkoutsApi.ts'

export const errorToBlockReason = (e: unknown): BlockReason => {
	// --- Envelope-level errors (Story 12.9) ---
	if (e instanceof KpsdkBlockedError) return 'blocked'
	// --- KPSDK fetch-level block (Story 14.3) ---
	if (e instanceof KpsdkFetchBlockedError) return 'blocked'
	if (e instanceof RateLimitedError) return 'rate_limited'
	if (e instanceof SessionExpiredError) return 'session_expired'
	if (e instanceof ServerError) return 'submit_failed'

	// --- Cart API (Story 12.1) ---
	if (e instanceof NikeCartApiError) return 'cart_error'

	// --- Cart views (Story 12.3) ---
	if (e instanceof CartViewTimeoutError) return 'view_timeout'
	if (e instanceof CartViewError) return 'invalid_address'

	// --- Fulfillment (Story 12.4) ---
	if (e instanceof FulfillmentJobTimeoutError) return 'fulfillment_timeout'
	if (e instanceof FulfillmentJobFailedError) return 'fulfillment_unavailable'
	if (e instanceof NoFulfillmentOfferingError) return 'no_shipping_method'

	// --- Payment (Story 12.5) ---
	if (e instanceof NoPaymentMethodError) return 'no_payment_method'
	if (e instanceof PaymentApiAuthError) return 'session_expired'

	// --- Review (Story 12.6) ---
	if (e instanceof TotalMismatchError) return 'total_mismatch'
	if (e instanceof ReviewTimeoutError) return 'review_timeout'
	if (e instanceof ReviewError) return 'review_failed'

	// --- SKU resolver (Story 12.2 / 12.7) ---
	if (e instanceof SkuNotFoundError) return 'sku_not_available'
	if (e instanceof StyleColorNotFoundError) return 'style_color_not_found'

	// --- Checkouts / submit (Story 12.8) ---
	if (e instanceof CheckoutKpsdkBlockedError) return 'blocked'
	if (e instanceof CheckoutServerError) return 'submit_failed'
	if (e instanceof CheckoutDeclinedError) return 'payment_declined'

	return 'unknown_error'
}
