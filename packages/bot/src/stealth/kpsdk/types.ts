export type KpsdkToken = {
	ct: string             // x-kpsdk-ct header value
	v: string              // x-kpsdk-v header value
	capturedAt: Date
	source: 'request' | 'forced'
}

export const PROTECTED_PATTERNS: RegExp[] = [
	/\/buy\/carts\/v2\/[A-Z]{2}\/NIKE\/NIKECOM/,
	/\/buy\/checkouts\//,
	/\/buy\/cart_reviews\//,
	/\/buy\/checkout_previews\//,
	/\/buy\/partner_cart_preorder\//,
	/\/launch\/entries\/v\d/,
	/\/cic\/grand\//,
	/\/idn\/phone\//,
]

export function isProtectedUrl(url: string): boolean {
	return PROTECTED_PATTERNS.some((re) => re.test(url))
}
