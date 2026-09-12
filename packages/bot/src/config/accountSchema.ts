import * as v from 'valibot'
import { normalizeProxyInput } from './proxyNormalize.ts'

export const AccountConfigSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	email: v.pipe(v.string(), v.email()),
	password: v.pipe(v.string(), v.minLength(1)),
	// Normalize WebShare/bare shapes to a URL before validation (see proxyNormalize).
	proxy: v.optional(v.pipe(v.string(), v.transform(normalizeProxyInput), v.url())),
	country: v.pipe(v.string(), v.length(2)),
	preferredSizes: v.optional(v.array(v.string()), []),
	paymentMethod: v.optional(v.string(), 'PRE_SAVED'),
})

export type AccountConfig = v.InferOutput<typeof AccountConfigSchema>
