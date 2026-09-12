// Story 12.2 — Resolve (styleColor, size) → skuId via Nike Product Feed.
//
// SDK reuse audit (Task 1):
//   packages/sdk/productFeed/api.ts exports getProductFeed(countryCode, language, ...)
//   which builds a general-feed URL with channelId + upcoming filters.
//   It does NOT support the productCode filter required here
//   (GET /product_feed/threads/v3/?filter=marketplace(X)&filter=productCode(SC)).
//   The SDK also does not expose a sub-path export for its internal rest.get utility.
//   We therefore call the URL directly via the global fetch (Node 18+), and reuse
//   SDK types (SkusOutput, ProductFeedOutput) so the resolver stays decoupled from
//   transport while sharing the validated type contracts.
//   Follow-up: SDK could expose getProductByCode(marketplace, styleColor) (Story 12.x).
//
// Product Feed is NOT KPSDK-protected — plain HTTPS, no page.request.fetch needed.
// NOTE: erasableSyntaxOnly=true — no constructor parameter properties.

import type { SkusOutput, ProductFeedOutput } from '@nike-release-checker/sdk'
import { skuCache } from './skuCache.ts'
import { countryRegistry } from '../../country/registry.ts'

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface ResolveArgs {
	styleColor: string
	euSize?: string
	usSize?: string
	ukSize?: string
	country?: string
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class StyleColorNotFoundError extends Error {
	readonly styleColor: string
	readonly country: string

	constructor(styleColor: string, country: string) {
		super(`styleColor ${styleColor} not found in marketplace ${country}`)
		this.name = 'StyleColorNotFoundError'
		this.styleColor = styleColor
		this.country = country
	}
}

export class SkuNotFoundError extends Error {
	readonly styleColor: string
	readonly size: string
	readonly availableSizes: string[]

	constructor(styleColor: string, size: string, availableSizes: string[]) {
		super(`size ${size} not available for ${styleColor}; have: ${availableSizes.join(',')}`)
		this.name = 'SkuNotFoundError'
		this.styleColor = styleColor
		this.size = size
		this.availableSizes = availableSizes
	}
}

// ---------------------------------------------------------------------------
// Nike Product Feed response shape (partial — only what we need)
// ---------------------------------------------------------------------------

interface ProductFeedApiResponse {
	objects?: ProductFeedOutput[]
}

// ---------------------------------------------------------------------------
// HTTP call — injectable for testing
// ---------------------------------------------------------------------------

/**
 * Fetches product feed filtered by styleColor (productCode) for a given marketplace.
 * Returns the raw objects array or throws on HTTP error.
 * This function is exported so tests can mock `fetchProductFeed` at the module level.
 */
// Nike's default SNKRS/threads channel. The v3 feed REJECTS a query (HTTP 400
// "Request validation failed") unless channelId is present alongside the
// style-color filter. Verified live 2026-05-04.
const DEFAULT_CHANNEL_ID = '010794e5-35fe-4e32-aaff-cd2c74f89d61'

export async function fetchProductFeed(
	marketplace: string,
	styleColor: string,
	language = 'en',
): Promise<ProductFeedOutput[]> {
	const url = new URL('https://api.nike.com/product_feed/threads/v3/')
	url.searchParams.append('filter', `marketplace(${marketplace})`)
	url.searchParams.append('filter', `language(${language})`)
	url.searchParams.append('filter', `channelId(${DEFAULT_CHANNEL_ID})`)
	// v3 uses the dotted merch-product path; the old `productCode(...)` filter
	// is invalid and 400s.
	url.searchParams.append('filter', `productInfo.merchProduct.styleColor(${styleColor})`)

	const res = await fetch(url.toString())
	if (res.status === 404) {
		const err: Error & { statusCode: number } = Object.assign(
			new Error(`404 from product feed: ${styleColor}`),
			{ statusCode: 404 },
		)
		throw err
	}
	if (!res.ok) {
		const err: Error & { statusCode: number } = Object.assign(
			new Error(`HTTP ${res.status} from product feed`),
			{ statusCode: res.status },
		)
		throw err
	}
	const body = (await res.json()) as ProductFeedApiResponse
	return body.objects ?? []
}

// ---------------------------------------------------------------------------
// Size matching helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a Nike size string: strip trailing/leading unit labels (EU, UK, US, CM, JP)
 * so "46 EU", "EUR 46", and "46" all compare equal.
 */
function normalizeSize(raw: string): string {
	return raw
		.trim()
		.replace(/\s*(EUR?|UK|US|CM|JP)\s*$/i, '')
		.replace(/^(EUR?|UK|US|CM|JP)\s*/i, '')
		.trim()
}

/**
 * Extract the localizedSize for a given country from a sku's countrySpecifications.
 */
function localizedSizeForCountry(sku: SkusOutput, country: string): string | undefined {
	const spec = sku.countrySpecifications.find((cs) => cs.country === country)
	return spec?.localizedSize
}

/**
 * Match a target size against a single sku for a given country.
 * Matching priority per story spec:
 *   US: nikeSize first, then localizedSize
 *   UK, FR, DE, IT and others: localizedSize first, then nikeSize
 */
export function matchSizeInSku(sku: SkusOutput, size: string, country: string): boolean {
	const target = normalizeSize(size)
	const localized = localizedSizeForCountry(sku, country)
	const localizedNorm = localized !== undefined ? normalizeSize(localized) : undefined
	const nikeNorm = normalizeSize(sku.nikeSize)

	if (country === 'US') {
		return nikeNorm === target || localizedNorm === target
	}
	// UK, FR, DE, IT and all others: localizedSize primary
	return localizedNorm === target || nikeNorm === target
}

/**
 * Find the first sku matching the target size in a skus array.
 * Exported so Story 13.x (Multi-Country) can reuse and extend it.
 */
export function matchSizeInSkus(
	skus: SkusOutput[],
	size: string,
	country: string,
): SkusOutput | undefined {
	return skus.find((sku) => matchSizeInSku(sku, size, country))
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a Nike skuId UUID from a (styleColor, size, country) triplet.
 * Consults an in-memory LRU cache (TTL 10 min) before calling the Nike API.
 * Throws StyleColorNotFoundError or SkuNotFoundError on failure (no retry).
 */
export const resolveSkuId = async (args: ResolveArgs): Promise<string> => {
	const country = args.country ?? 'FR'
	const size = args.euSize ?? args.usSize ?? args.ukSize
	if (!size) throw new Error('one of euSize/usSize/ukSize required')

	// Cache lookup — avoids redundant network calls within TTL
	const cached = skuCache.get(country, args.styleColor, size)
	if (cached !== undefined) return cached

	// Resolve the marketplace language for the feed query (FR→fr, US→en, …).
	// The v3 feed requires a language filter; default to 'en' for unknown codes.
	let language = 'en'
	try {
		language = countryRegistry.get(country).languageCode
	} catch {
		// unknown country — keep 'en'
	}

	// Fetch from Nike Product Feed
	let feedObjects: ProductFeedOutput[]
	try {
		feedObjects = await fetchProductFeed(country, args.styleColor, language)
	} catch (err) {
		const statusCode = (err as { statusCode?: number }).statusCode
		if (statusCode === 404) {
			throw new StyleColorNotFoundError(args.styleColor, country)
		}
		throw err
	}

	// Empty objects → style color not found (404-equivalent for this feed)
	if (feedObjects.length === 0) {
		throw new StyleColorNotFoundError(args.styleColor, country)
	}

	// Collect all skus across all threads × productInfo entries (defensive)
	const allSkus: SkusOutput[] = []
	for (const thread of feedObjects) {
		for (const info of thread.productInfo) {
			if (info.skus) allSkus.push(...info.skus)
		}
	}

	if (allSkus.length === 0) {
		throw new StyleColorNotFoundError(args.styleColor, country)
	}

	// Find matching sku
	const matched = matchSizeInSkus(allSkus, size, country)
	if (!matched) {
		const availableSizes = allSkus.map((sku) => {
			const loc = localizedSizeForCountry(sku, country)
			return loc ?? sku.nikeSize
		})
		throw new SkuNotFoundError(args.styleColor, size, availableSizes)
	}

	const skuId = matched.id
	// Do not cache null/undefined — only reached when matched is defined
	skuCache.set(country, args.styleColor, size, skuId)
	return skuId
}
