import * as v from 'valibot'

export const SelectorsSchema = v.object({
	// Login flow (accounts.nike.com)
	loginEmailInput: v.string(),
	loginContinueButton: v.string(),
	loginPasswordInput: v.string(),
	loginSubmitButton: v.string(),
	loginSuccessIndicator: v.string(),
	loginErrorIndicator: v.string(),

	// Product page - size grid
	sizeAvailable: v.string(),
	sizeSelected: v.string(),
	purchaseButton: v.string(),

	// Cart / checkout navigation
	checkoutLink: v.string(),

	// Checkout - shipping step
	shippingSaveButton: v.string(),

	// Checkout - payment step
	paymentContinueButton: v.string(),

	// Checkout - order review step
	orderSubmitButton: v.string(),

	// Error detection
	soldOutIndicator: v.string(),
	blockDetectionSignal: v.string(),

	// 3D Secure detection
	threeDSecureIframe: v.string(),

	// Product page — checkout pipeline selectors
	productPage: v.optional(
		v.object({
			sizeGrid: v.optional(v.string(), ''),
			sizeButton: v.optional(v.string(), ''),
			addToCartButton: v.optional(v.string(), ''),
			soldOutIndicator: v.optional(v.string(), ''),
			blockIndicator: v.optional(v.string(), ''),
		}),
		{ sizeGrid: '', sizeButton: '', addToCartButton: '', soldOutIndicator: '', blockIndicator: '' },
	),

	// Cart
	cart: v.optional(
		v.object({
			checkoutButton: v.optional(v.string(), ''),
			cartCount: v.optional(v.string(), ''),
		}),
		{ checkoutButton: '', cartCount: '' },
	),

	// Checkout pipeline selectors
	checkout: v.optional(
		v.object({
			shippingContinueButton: v.optional(v.string(), ''),
			paymentSection: v.optional(v.string(), ''),
			paymentContinueButton: v.optional(v.string(), ''),
			threeDSIframe: v.optional(v.string(), ''),
			submitOrderButton: v.optional(v.string(), ''),
			orderConfirmation: v.optional(v.string(), ''),
		}),
		{
			shippingContinueButton: '',
			paymentSection: '',
			paymentContinueButton: '',
			threeDSIframe: '',
			submitOrderButton: '',
			orderConfirmation: '',
		},
	),

	// Cookie consent modal — appears on every Nike page and blocks interaction
	// if not dismissed. Set to empty strings to skip dismissal.
	cookieConsent: v.optional(
		v.object({
			modalRoot: v.optional(v.string(), ''),
			declineButton: v.optional(v.string(), ''),
			acceptButton: v.optional(v.string(), ''),
		}),
		{ modalRoot: '', declineButton: '', acceptButton: '' },
	),
})

export type Selectors = v.InferOutput<typeof SelectorsSchema>
