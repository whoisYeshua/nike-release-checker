import { sql } from '@vercel/postgres'
import type { ProductFeedOutput } from '../../snkrs-sdk/productFeed/schema.ts'

type CacheRow = {
	data: ProductFeedOutput[] | string
	updated_at: string | Date
}

const normalizeDate = (value: string | Date) => {
	return value instanceof Date ? value : new Date(value)
}

const parseData = (value: CacheRow['data']) => {
	return typeof value === 'string' ? (JSON.parse(value) as ProductFeedOutput[]) : value
}

export const getCachedFeed = async (countryCode: string) => {
	const { rows } = await sql<CacheRow>`
		SELECT data, updated_at
		FROM product_feed_cache
		WHERE country_code = ${countryCode}
			AND updated_at > now() - interval '1 hour'
		LIMIT 1
	`

	const row = rows[0]

	if (!row) return null

	return { data: parseData(row.data), updatedAt: normalizeDate(row.updated_at) }
}

export const upsertFeedCache = async (countryCode: string, data: ProductFeedOutput[]) => {
	const payload = JSON.stringify(data)

	await sql`
		INSERT INTO product_feed_cache (country_code, data, updated_at)
		VALUES (${countryCode}, ${payload}::jsonb, now())
		ON CONFLICT (country_code)
		DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
	`
}

