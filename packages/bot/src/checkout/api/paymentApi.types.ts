// paymentApi.types.ts — type contract for Story 12.5 Payment Options API
// Used by NikePaymentApi and pickDefaultPaymentMethod.

export type PaymentMethodType = 'CARD' | 'PAYPAL' | 'KLARNA' | 'APPLE_PAY' | 'GOOGLE_PAY' | 'GIFT_CARD'

export interface PaymentMethod {
	methodId: string
	type: PaymentMethodType
	displayLabel: string
	last4?: string
	brand?: 'VISA' | 'MASTERCARD' | 'AMEX' | string
	isDefault?: boolean
	expiresAt?: string
}

export interface ListOptionsArgs {
	cartId: string
	country: string
	currency?: string
}
