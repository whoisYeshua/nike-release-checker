import * as v from 'valibot'

export const DropCsvRowSchema = v.object({
	sku: v.pipe(v.string(), v.regex(/^[A-Z0-9-]+$/)),
	sizes: v.pipe(v.string(), v.minLength(1)),
	accounts_filter: v.pipe(v.string(), v.minLength(1)),
	country: v.optional(v.string(), ''),
})

export type DropCsvRow = v.InferOutput<typeof DropCsvRowSchema>
