// Cart views type contract — Story 12.3
// The cart_views API is the state machine for shipping/payment/review
// (replaces v2 DOM navigateCheckout + completeShipping, see FR62).

export type CartViewType = 'SHIPPING' | 'PAYMENT' | 'REVIEW'
export type CartViewStatus = 'PENDING' | 'READY' | 'ERROR'

export interface NikeAddress {
	recipient: { firstName: string; lastName: string }
	addressLines: string[]
	locality: string
	postalCode: string
	country: string
	phoneNumber: string
}

export interface CartView {
	viewId: string
	type: CartViewType
	status: CartViewStatus
	cartId: string
	address?: NikeAddress
	errors?: Array<{ code: string; field?: string; message?: string }>
}
