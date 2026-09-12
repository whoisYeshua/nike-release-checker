// Type definitions for the cart review API (Story 12.6, FR66).
// PUT/GET https://api.nike.com/buy/cart_reviews/v2/<reviewUuid>

export type ReviewStatus = 'PENDING' | 'READY' | 'ERROR'

export interface ComputedTotal {
	subtotal: number
	shipping: number
	tax: number
	total: number
	currency: string
}

export interface ReviewLineItem {
	skuId: string
	displayName: string
	size: string
	quantity: number
	unitPrice: number
}

export interface CartReview {
	reviewId: string
	status: ReviewStatus
	cartId: string
	computedTotal?: ComputedTotal
	lineItems?: ReviewLineItem[]
	address?: { city: string; postalCode: string; country: string } // redacted shape
	paymentMethod?: { type: string; last4?: string; brand?: string }
	etaWindow?: { earliest: string; latest: string }
}
