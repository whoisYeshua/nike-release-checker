// CheckoutResponse — shape of the PUT /buy/checkouts/<cartId> response.
// Story 12.8, FR65.

export type CheckoutStatus = 'CONFIRMED' | 'PENDING_3DS' | 'DECLINED' | 'PENDING'

export interface CheckoutResponse {
	orderNumber: string
	orderId: string
	status: CheckoutStatus
	totalAmount?: number
	currency?: string
	etaWindow?: { earliest: string; latest: string }
	receiptUrl?: string
}
