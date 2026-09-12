// Type contract for Nike cart API (api.nike.com/buy/carts/v2/*).
// Shapes captured live from the Nike API and documented in docs/NIKE_API_REFERENCE.md.

export interface CartItem {
	id: string
	skuId: string
	productId: string
	quantity: number
	priceInfo: { total: number; currency: string }
	itemData?: { url: string }
}

export interface Cart {
	id: string
	country: string
	currency: string
	visitorId?: string
	items: CartItem[]
	totals: { subtotal: number; total: number; currency: string }
}

// Note: `merge` is Nike-specific (not in RFC 6902). Treat as opaque string in the union.
export type JsonPatchOp =
	| { op: 'add'; path: string; value: unknown }
	| { op: 'remove'; path: string }
	| { op: 'replace'; path: string; value: unknown }
	| { op: 'merge'; path: string; value: unknown }
