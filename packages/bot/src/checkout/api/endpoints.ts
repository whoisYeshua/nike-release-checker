// Centralized Nike API endpoint URL builders.
// All market-segment substitutions (country code, language, marketplace) are
// derived from the fully-resolved Country object from countryRegistry.
// This is the ONLY place that knows URL path shapes — downstream API modules
// just pass Country objects through.
//
// Story 13.2 — per-country cart endpoint parameterization.

import type { Country } from '../../country/types.ts'

const BASE = 'https://api.nike.com'

export const cartEndpoints = {
	/** PATCH/POST cart — always includes ?modifiers= query (required by Nike). */
	cart: (c: Country): string =>
		`${BASE}/buy/carts/v2/${c.code}/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY`,

	/** GET cart — bare path without modifiers query. */
	cartGet: (c: Country): string =>
		`${BASE}/buy/carts/v2/${c.code}/NIKE/NIKECOM`,

	/** GET/PUT cart_views — viewId is client-generated. */
	cartView: (_c: Country, viewId: string): string =>
		`${BASE}/buy/cart_views/v1/${viewId}`,

	/** GET fulfillment offerings — marketplace + language query params. */
	fulfillmentOfferings: (c: Country): string =>
		`${BASE}/buy/fulfillment_offerings/v1?marketplace=${c.code}&language=${c.languageCode}`,

	/** PUT/GET fulfillment pricing job — jobId is client-generated. */
	fulfillmentJob: (_c: Country, jobId: string): string =>
		`${BASE}/buy/fulfillment_offerings_jobs/v2/${jobId}`,

	/** GET/POST payment options. */
	paymentOptions: (c: Country): string =>
		`${BASE}/payment/options/v3?marketplace=${c.code}`,

	/** PUT/GET cart review — reviewId is client-generated. */
	cartReview: (_c: Country, reviewId: string): string =>
		`${BASE}/buy/cart_reviews/v2/${reviewId}`,

	/** PUT checkout (final submit). */
	checkout: (_c: Country, cartId: string): string =>
		`${BASE}/buy/checkouts/${cartId}`,

	/** Nike product URL prefix for addItem — e.g. /fr/t/<slug>/<styleColor>. */
	productUrl: (c: Country, slug: string, styleColor: string): string =>
		`/${c.languageCode}/t/${slug}/${styleColor}`,
}
