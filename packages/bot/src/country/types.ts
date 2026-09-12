import * as v from 'valibot'

export const CountrySchema = v.object({
	code: v.pipe(v.string(), v.length(2), v.regex(/^[A-Z]{2}$/)),
	name: v.pipe(v.string(), v.minLength(1)),
	currency: v.pipe(v.string(), v.length(3), v.regex(/^[A-Z]{3}$/)),
	locale: v.pipe(v.string(), v.regex(/^[a-z]{2}-[A-Z]{2}$/)),
	languageCode: v.pipe(v.string(), v.length(2)),
	defaultPhonePrefix: v.pipe(v.string(), v.regex(/^\+\d{1,3}$/)),
	phonePattern: v.instance(RegExp),
	zipPattern: v.instance(RegExp),
	addressFields: v.array(v.picklist(['street', 'street2', 'city', 'state', 'zip', 'country'])),
	adyenIframeLocale: v.pipe(v.string(), v.regex(/^[a-z]{2}_[A-Z]{2}$/)),
	selectorOverridePath: v.nullable(v.string()),
	enabled: v.boolean(),
	description: v.optional(v.string()),
	feedSupported: v.optional(v.boolean()),
})

export type Country = v.InferOutput<typeof CountrySchema>

export class UnknownCountryError extends Error {
	readonly code: string
	constructor(code: string) {
		super(`Unknown country code: ${code}`)
		this.code = code
		this.name = 'UnknownCountryError'
	}
}
