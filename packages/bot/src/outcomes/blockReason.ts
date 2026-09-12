// BlockReason taxonomy — single source of truth for outcome classification.
// Consumed by Story 12.9 errorToBlockReason and the Epic 11 TUI dashboard.
// Adding a new value requires updating the dashboard's reason renderer (Story 11.1).

export type BlockReason =
	// Bot-detection
	| 'blocked'
	| 'rate_limited'
	// Session
	| 'session_expired'
	// Cart / checkout flow
	| 'cart_error'
	| 'invalid_address'
	| 'view_timeout'
	// Fulfillment
	| 'fulfillment_timeout'
	| 'fulfillment_unavailable'
	| 'no_shipping_method'
	// Payment
	| 'no_payment_method'
	| 'payment_declined'
	// Review / submit
	| 'total_mismatch'
	| 'review_timeout'
	| 'review_failed'
	| 'submit_failed'
	// Product availability
	| 'sku_not_available'
	| 'style_color_not_found'
	// Catch-all
	| 'unknown_error'
