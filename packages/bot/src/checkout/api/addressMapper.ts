// addressMapper — transforms the internal checkout address shape into
// Nike's cart_views API `NikeAddress` format.
//
// FR-correct out of the box. Epic 13 will add country-conditional fields
// (e.g. US `state`, UK `county`).
// Story 12.3, FR62.

import type { NikeAddress } from './cartViewsApi.types.ts'

// Internal address shape used throughout the checkout pipeline.
// Kept in this file so it can evolve without coupling to addressesCsv.ts.
export interface CheckoutAddress {
	firstName: string
	lastName: string
	line1: string
	line2?: string
	city: string
	postalCode: string
	country: string
	phone: string
}

export const toNikeAddress = (a: CheckoutAddress): NikeAddress => ({
	recipient: { firstName: a.firstName, lastName: a.lastName },
	addressLines: [a.line1, ...(a.line2 ? [a.line2] : [])],
	locality: a.city,
	postalCode: a.postalCode,
	country: a.country,
	phoneNumber: a.phone,
})
