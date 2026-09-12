// NikeCheckoutsApi — issues PUT /buy/checkouts/<cartId> via page.evaluate(fetch)
// so the request runs inside the browser JS context where Kasada's injected
// ServiceWorker can attach valid x-kpsdk-cd proof-of-work headers.
//
// This is the "Pay now" equivalent — the final submit step that commits an order.
// The endpoint is KPSDK-protected and idempotent on cartId per Nike behaviour.
//
// Story 12.8, FR65.
//
// NOTE: submit() UNCONDITIONALLY calls Nike. Caller is responsible for
// the dry-run gate. See packages/bot/src/checkout/pipelines/hybridPipeline.ts.

import type { Page } from 'playwright'
import type { CheckoutResponse } from './checkoutsApi.types.ts'
import { getBearerToken } from './oidcBearer.ts'

const API_ORIGIN = 'https://api.nike.com'

// ─── Error classes ────────────────────────────────────────────────────────────

// Thrown when Nike returns 403 — KPSDK proof-of-work rejected.
// Story 12-9's withApiRetry handles the refresh-and-retry-once path.
export class CheckoutKpsdkBlockedError extends Error {
	readonly name = 'CheckoutKpsdkBlockedError'
	readonly cartId: string
	readonly status: number = 403

	constructor(cartId: string) {
		super(`PUT /buy/checkouts/${cartId} blocked by KPSDK (403)`)
		this.cartId = cartId
	}
}

// Thrown when Nike returns 5xx — server-side error.
// The endpoint is idempotent on cartId, so a single retry is safe.
export class CheckoutServerError extends Error {
	readonly name = 'CheckoutServerError'
	readonly cartId: string
	readonly status: number

	constructor(cartId: string, status: number) {
		super(`PUT /buy/checkouts/${cartId} returned ${status}`)
		this.cartId = cartId
		this.status = status
	}
}

// Thrown when Nike returns 402 — payment was declined.
export class CheckoutDeclinedError extends Error {
	readonly name = 'CheckoutDeclinedError'
	readonly cartId: string
	readonly status: number = 402

	constructor(cartId: string) {
		super(`PUT /buy/checkouts/${cartId} declined (402) — payment refused`)
		this.cartId = cartId
	}
}

// ─── API client ───────────────────────────────────────────────────────────────

export class NikeCheckoutsApi {
	private readonly page: Page

	constructor(page: Page) {
		this.page = page
	}

	/**
	 * Submits the checkout by issuing PUT /buy/checkouts/<cartId> with an
	 * empty JSON body `{}`. Nike derives all submission state from the cart
	 * and bound views — do NOT add a non-empty body (Nike returns 400).
	 *
	 * The request runs inside the browser JS context (page.evaluate) so
	 * Kasada's ServiceWorker intercept fires and attaches x-kpsdk-cd POW headers.
	 */
	async submit(cartId: string): Promise<CheckoutResponse> {
		const token = await getBearerToken(this.page)

		const args = {
			url: `${API_ORIGIN}/buy/checkouts/${cartId}`,
			token,
		}

		const res = await this.page.evaluate(
			async (a: { url: string; token: string }) => {
				const r = await fetch(a.url, {
					method: 'PUT',
					credentials: 'include',
					body: '{}',
					headers: {
						'content-type': 'application/json; charset=UTF-8',
						accept: 'application/json',
						Authorization: 'Bearer ' + a.token,
					},
				})
				const headersObj: Record<string, string> = {}
				r.headers.forEach((v, k) => {
					headersObj[k] = v
				})
				let bodyText = ''
				try {
					bodyText = await r.text()
				} catch {
					bodyText = ''
				}
				return {
					status: r.status,
					headers: headersObj,
					body: bodyText,
					ok: r.ok,
				}
			},
			args,
		)

		if (res.status === 403) throw new CheckoutKpsdkBlockedError(cartId)
		if (res.status === 402) throw new CheckoutDeclinedError(cartId)
		if (res.status >= 500) throw new CheckoutServerError(cartId, res.status)
		if (!res.ok) throw new Error(`PUT /buy/checkouts/${cartId}: ${res.status}`)

		try {
			return JSON.parse(res.body) as CheckoutResponse
		} catch {
			throw new Error(`PUT /buy/checkouts/${cartId}: unparseable response body`)
		}
	}
}
