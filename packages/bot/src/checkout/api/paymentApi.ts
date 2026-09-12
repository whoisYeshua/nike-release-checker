// NikePaymentApi — calls api.nike.com/payment/options/v3 via page.evaluate(() => fetch())
// so requests run inside the browser JS context where Kasada's injected ServiceWorker
// can attach valid x-kpsdk-cd proof-of-work headers.
// Bearer token is extracted from OIDC localStorage by getBearerToken().
//
// bindPaymentMethod delegates to NikeCartViewsApi.mergeView() (Story 12.3 cross-story coupling).
// See cartViewsApi.ts header for mergeView() docs.
// Story 12.5, FR64.

import type { Page } from 'playwright'
import type { PaymentMethod, ListOptionsArgs, PaymentMethodType } from './paymentApi.types.ts'
import { getBearerToken } from './oidcBearer.ts'
import { NikeCartViewsApi } from './cartViewsApi.ts'

const API_ORIGIN = 'https://api.nike.com'

// ─── Error classes ────────────────────────────────────────────────────────────

// BlockReason mapping:
//   NoPaymentMethodError  → no_payment_method (triggers Story 12-7 Adyen DOM fallback)
//   PaymentApiAuthError   → session_expired   (Story 12-9 retries once after refresh)

export class NoPaymentMethodError extends Error {
	readonly name = 'NoPaymentMethodError'
	constructor() {
		super('no payment methods available — use Adyen DOM fallback')
	}
}

export class PaymentApiAuthError extends Error {
	readonly name = 'PaymentApiAuthError'
	constructor() {
		super('payment/options/v3 returned 401 — session refresh required')
	}
}

export class PaymentApiError extends Error {
	readonly name = 'PaymentApiError'
	readonly status: number
	readonly bodyPreview: string

	constructor(status: number, body: string) {
		super(`Nike payment API → ${status}`)
		this.status = status
		this.bodyPreview = body.slice(0, 256)
	}
}

// ─── Default method picker ────────────────────────────────────────────────────

// Production callers should pass prefer:'CARD' for v3.0.
// PayPal/Klarna integrations are out of scope until v3.2.
//
// Priority:
//   1. First method matching opts.prefer (if set)
//   2. First method with isDefault === true
//   3. methods[0]
//   4. throws NoPaymentMethodError if array is empty
export const pickDefaultPaymentMethod = (
	methods: PaymentMethod[],
	opts: { prefer?: PaymentMethodType } = {},
): PaymentMethod => {
	if (methods.length === 0) throw new NoPaymentMethodError()
	if (opts.prefer) {
		const match = methods.find((m) => m.type === opts.prefer)
		if (match) return match
	}
	const fallback = methods.find((m) => m.isDefault) ?? methods[0]!
	return fallback
}

// ─── API client ───────────────────────────────────────────────────────────────

export class NikePaymentApi {
	private readonly page: Page
	private readonly cartViewsApi: NikeCartViewsApi

	constructor(page: Page) {
		this.page = page
		this.cartViewsApi = new NikeCartViewsApi(page)
	}

	// Lists available payment methods for the given cart.
	// POST https://api.nike.com/payment/options/v3
	// Defensive parse: tries `methods`, then `paymentMethods`, then `objects`.
	async listOptions(args: ListOptionsArgs): Promise<PaymentMethod[]> {
		const body = JSON.stringify({
			cartId: args.cartId,
			country: args.country,
			currency: args.currency ?? 'EUR',
		})

		const token = await getBearerToken(this.page)

		const evalArgs = {
			url: `${API_ORIGIN}/payment/options/v3`,
			method: 'POST',
			headers: {
				accept: 'application/json',
				'content-type': 'application/json; charset=UTF-8',
			},
			data: body,
			token,
		}

		const res = await this.page.evaluate(
			async (a: {
				url: string
				method: string
				headers: Record<string, string>
				data: string
				token: string
			}) => {
				const r = await fetch(a.url, {
					method: a.method,
					credentials: 'include',
					body: a.data,
					headers: {
						...a.headers,
						Authorization: 'Bearer ' + a.token,
					},
				})
				let bodyText = ''
				try {
					bodyText = await r.text()
				} catch {
					bodyText = ''
				}
				return {
					status: r.status,
					body: bodyText,
					ok: r.ok,
				}
			},
			evalArgs,
		)

		if (res.status === 401) throw new PaymentApiAuthError()
		if (!res.ok) throw new PaymentApiError(res.status, res.body)

		let parsed: Record<string, unknown>
		try {
			parsed = JSON.parse(res.body) as Record<string, unknown>
		} catch {
			throw new PaymentApiError(res.status, res.body)
		}

		// Defensive parse for different Nike API iterations.
		const raw =
			(parsed['methods'] as PaymentMethod[] | undefined) ??
			(parsed['paymentMethods'] as PaymentMethod[] | undefined) ??
			(parsed['objects'] as PaymentMethod[] | undefined) ??
			[]

		return raw
	}

	// Binds a payment method to the active cart view.
	// Delegates to NikeCartViewsApi.mergeView() (Story 12.3 transport).
	// PUT /buy/cart_views/v1/<viewId> with patch {selectedPaymentMethod: methodId}
	async bindPaymentMethod(args: { viewId: string; methodId: string }) {
		return this.cartViewsApi.mergeView(args.viewId, {
			selectedPaymentMethod: args.methodId,
		})
	}
}
