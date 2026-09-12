// Unit tests for Story 12.2 — skuResolver.
// Mocks global.fetch since fetchProductFeed uses it directly.
// Pattern: node:test + node:assert, ESM, tabs, .ts extensions, erasableSyntaxOnly=true.

import { describe, it, mock } from 'node:test'
import { strict as assert } from 'node:assert'

import type { MarketplaceOutput, SkusOutput } from '@nike-release-checker/sdk'

import {
	resolveSkuId,
	StyleColorNotFoundError,
	SkuNotFoundError,
	matchSizeInSkus,
	matchSizeInSku,
} from './skuResolver.ts'
import { SkuCache } from './skuCache.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSku(
	id: string,
	nikeSize: string,
	countrySpecs: Array<{ country: MarketplaceOutput; localizedSize: string }>,
): SkusOutput {
	return {
		catalogSkuId: `cat-${id}`,
		countrySpecifications: countrySpecs.map((cs) => ({
			country: cs.country,
			localizedSize: cs.localizedSize,
			taxInfo: {},
		})),
		gtin: `gtin-${id}`,
		id,
		links: { self: { ref: '' } },
		merchGroup: 'EU',
		modificationDate: '2026-01-01',
		nikeSize,
		parentId: 'parent-1',
		parentType: 'merchProduct',
		productId: 'prod-1',
		resourceType: 'merchSku',
		snapshotId: 'snap-1',
		stockKeepingUnitId: `sku-${id}`,
	}
}

/**
 * Build a minimal ProductFeed API response (as returned by fetch → json()).
 * Uses unknown cast to avoid the need to fully satisfy deep nested schemas
 * — resolveSkuId only reads .objects[].productInfo[].skus[].
 */
function makeFeedResponse(skus: SkusOutput[], marketplace: MarketplaceOutput = 'FR'): unknown {
	return {
		objects: [
			{
				channelId: 'ch-1',
				channelName: 'Nike.com',
				collectionsv2: { collectionTermIds: [], groupedCollectionTermIds: null },
				collectionTermIds: [],
				id: 'thread-1',
				language: 'fr',
				lastFetchTime: '2026-01-01',
				links: { self: { ref: '' } },
				marketplace,
				productInfo: [
					{
						availability: {
							available: true,
							id: 'av-1',
							productId: 'p-1',
							resourceType: 'availableProducts',
						},
						merchPrice: {
							country: marketplace,
							currency: 'EUR',
							currentPrice: 109,
							discounted: false,
							fullPrice: 109,
							id: 'price-1',
							links: { self: { ref: '' } },
							modificationDate: '2026-01-01',
							parentId: 'parent-1',
							parentType: 'merchProduct',
							productId: 'prod-1',
							promoExclusions: [],
							promoInclusions: [],
							resourceType: 'merchPrice',
							snapshotId: 'snap-1',
						},
						merchProduct: {
							styleColor: 'CW2288-111',
							id: 'mp-1',
							resourceType: 'merchProduct',
							styleType: 'INLINE',
						},
						productContent: { globalPid: 'pid-1', langLocale: 'fr_FR', techSpec: '' },
						skus,
					},
				],
				publishedContent: { id: 'pc-1', resourceType: 'publishedContent' },
				resourceType: 'thread',
				search: { conceptIds: [] },
			},
		],
	}
}

/** Mock global.fetch to return JSON body with status 200. */
function mockFetchOk(body: unknown): void {
	global.fetch = mock.fn(async () => ({
		ok: true,
		status: 200,
		json: async () => body,
	})) as unknown as typeof fetch
}

/** Mock global.fetch to return a given HTTP status (non-2xx). */
function mockFetchError(status: number): void {
	global.fetch = mock.fn(async () => ({
		ok: false,
		status,
		json: async () => ({}),
	})) as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// SKU fixtures used across tests
// ---------------------------------------------------------------------------

const skuFr46 = makeSku('uuid-46', '11', [{ country: 'FR', localizedSize: '46' }])
const skuFr44 = makeSku('uuid-44', '10', [{ country: 'FR', localizedSize: '44' }])
// US sku: nikeSize '10', localizedSize for US is '44 EU' (fallback test)
const skuUs10 = makeSku('uuid-us10', '10', [{ country: 'US', localizedSize: '44' }])
// Sku with no countrySpecifications — only nikeSize
const skuNikeOnly = makeSku('uuid-nike', '46', [])

// ---------------------------------------------------------------------------
// matchSizeInSku — pure unit tests (no fetch)
// ---------------------------------------------------------------------------

describe('matchSizeInSku — pure size matching', () => {
	it('FR: matches localizedSize exactly', () => {
		assert.ok(matchSizeInSku(skuFr46, '46', 'FR'))
	})

	it('FR: does not match wrong size', () => {
		assert.ok(!matchSizeInSku(skuFr46, '44', 'FR'))
	})

	it('FR: normalizes "46 EU" suffix to "46" and matches', () => {
		const sku = makeSku('uuid-eu', '11', [{ country: 'FR', localizedSize: '46 EU' }])
		assert.ok(matchSizeInSku(sku, '46', 'FR'))
	})

	it('FR: normalizes "EUR 46" prefix to "46" and matches', () => {
		const sku = makeSku('uuid-eur', '11', [{ country: 'FR', localizedSize: 'EUR 46' }])
		assert.ok(matchSizeInSku(sku, '46', 'FR'))
	})

	it('FR: falls back to nikeSize when no FR countrySpec exists', () => {
		assert.ok(matchSizeInSku(skuNikeOnly, '46', 'FR'))
	})

	it('US: matches nikeSize', () => {
		assert.ok(matchSizeInSku(skuUs10, '10', 'US'))
	})

	it('US: falls back to localizedSize when nikeSize misses', () => {
		// nikeSize='10' won't match '44', but localizedSize for US is '44 EU' → normalized '44'
		const sku = makeSku('uuid-usfallback', '10', [{ country: 'US', localizedSize: '44 EU' }])
		assert.ok(matchSizeInSku(sku, '44', 'US'))
	})
})

describe('matchSizeInSkus', () => {
	it('returns the matching sku', () => {
		const result = matchSizeInSkus([skuFr44, skuFr46], '46', 'FR')
		assert.equal(result?.id, 'uuid-46')
	})

	it('returns undefined when no sku matches', () => {
		assert.equal(matchSizeInSkus([skuFr44, skuFr46], '42', 'FR'), undefined)
	})
})

// ---------------------------------------------------------------------------
// resolveSkuId — happy paths
// ---------------------------------------------------------------------------

describe('resolveSkuId — happy paths', () => {
	it('FR EU size → resolves skuId', async () => {
		mockFetchOk(makeFeedResponse([skuFr46, skuFr44]))
		const result = await resolveSkuId({ styleColor: 'HAPPY-FR-46', euSize: '46', country: 'FR' })
		assert.equal(result, 'uuid-46')
	})

	it('US numeric size → resolves via nikeSize', async () => {
		mockFetchOk(makeFeedResponse([skuUs10], 'US'))
		const result = await resolveSkuId({ styleColor: 'HAPPY-US-10', usSize: '10', country: 'US' })
		assert.equal(result, 'uuid-us10')
	})

	it('size present in nikeSize but not localizedSize → resolves', async () => {
		mockFetchOk(makeFeedResponse([skuNikeOnly]))
		const result = await resolveSkuId({ styleColor: 'HAPPY-NIKEONLY-46', euSize: '46', country: 'FR' })
		assert.equal(result, 'uuid-nike')
	})
})

// ---------------------------------------------------------------------------
// resolveSkuId — error paths
// ---------------------------------------------------------------------------

describe('resolveSkuId — error paths', () => {
	it('size missing → SkuNotFoundError with availableSizes populated', async () => {
		mockFetchOk(makeFeedResponse([skuFr44, skuFr46]))
		await assert.rejects(
			() => resolveSkuId({ styleColor: 'CW2288-111', euSize: '42', country: 'FR' }),
			(err: unknown) => {
				assert.ok(err instanceof SkuNotFoundError)
				assert.equal(err.size, '42')
				assert.ok(err.availableSizes.includes('44'))
				assert.ok(err.availableSizes.includes('46'))
				return true
			},
		)
	})

	it('404 from fetch → StyleColorNotFoundError', async () => {
		mockFetchError(404)
		await assert.rejects(
			() => resolveSkuId({ styleColor: 'NOTEXIST-000', euSize: '46', country: 'FR' }),
			StyleColorNotFoundError,
		)
	})

	it('empty objects[] → StyleColorNotFoundError', async () => {
		mockFetchOk({ objects: [] })
		await assert.rejects(
			() => resolveSkuId({ styleColor: 'EMPTY-000', euSize: '46', country: 'FR' }),
			StyleColorNotFoundError,
		)
	})

	it('no euSize/usSize/ukSize provided → throws generic Error', async () => {
		await assert.rejects(
			() => resolveSkuId({ styleColor: 'CW2288-111' }),
			(err: unknown) => {
				assert.ok(err instanceof Error)
				assert.ok((err as Error).message.includes('euSize/usSize/ukSize'))
				return true
			},
		)
	})
})

// ---------------------------------------------------------------------------
// resolveSkuId — cache behaviour
// ---------------------------------------------------------------------------

describe('resolveSkuId — cache behaviour', () => {
	it('cache hit on second call within TTL → fetch called only once', async () => {
		const fetchSpy = mock.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => makeFeedResponse([skuFr46]),
		}))
		global.fetch = fetchSpy as unknown as typeof fetch

		// Use a unique styleColor so the module-level cache won't have it
		await resolveSkuId({ styleColor: 'CW2288-CACHETEST', euSize: '46', country: 'FR' })
		await resolveSkuId({ styleColor: 'CW2288-CACHETEST', euSize: '46', country: 'FR' })

		assert.equal(fetchSpy.mock.calls.length, 1)
	})

	it('SkuCache: expired entry is evicted on get → treated as cache miss', () => {
		// Test TTL expiry directly on SkuCache without patching global Date.now.
		// We insert a synthetic entry with expiresAt in the past.
		const cache = new SkuCache()
		// Prime via public API at "now"
		cache.set('FR', 'TTL-SC', '46', 'uuid-ttl')
		// Confirm it's retrievable
		assert.equal(cache.get('FR', 'TTL-SC', '46'), 'uuid-ttl')

		// Directly override the internal store entry to simulate TTL expiry
		// (accessing private map via cast — acceptable in unit tests)
		const store = (cache as unknown as { store: Map<string, { skuId: string; expiresAt: number }> }).store
		const key = 'FR:TTL-SC:46'
		const entry = store.get(key)
		if (entry) {
			store.set(key, { skuId: entry.skuId, expiresAt: Date.now() - 1 })
		}

		// Now get should return undefined (expired)
		assert.equal(cache.get('FR', 'TTL-SC', '46'), undefined)
	})
})
