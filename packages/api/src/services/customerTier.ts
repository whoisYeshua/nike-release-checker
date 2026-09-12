/**
 * Customer tier resolver.
 * Story 16.x will replace the in-memory stub with a real Postgres query.
 *
 * Cache: LRU-style Map capped at MAX_SIZE entries, TTL 60 s per entry.
 * Tier changes are rare; a 60 s lag is acceptable.
 */

export type Tier = 'solo' | 'pro' | 'enterprise'

interface CacheEntry {
	tier: Tier
	expiresAt: number
}

const CACHE_TTL_MS = 60_000
const MAX_SIZE = 10_000

const cache = new Map<string, CacheEntry>()

// In-memory customer store (stub until Story 16.x Postgres migration).
const customerStore = new Map<string, Tier>()

/**
 * Seed a customer's tier for testing / bootstrapping.
 * Not exposed in the public API surface.
 */
export function _seedCustomerTier(customerId: string, tier: Tier): void {
	customerStore.set(customerId, tier)
	cache.delete(customerId)
}

/** Clear store and cache — used between tests. */
export function _clearCustomerTier(): void {
	customerStore.clear()
	cache.clear()
}

/**
 * Resolve the subscription tier for a customer.
 * Falls back to 'solo' (most restrictive) for unknown customers.
 */
export async function getTier(customerId: string): Promise<Tier> {
	const now = Date.now()

	const cached = cache.get(customerId)
	if (cached != null && cached.expiresAt > now) {
		return cached.tier
	}

	// Evict if at capacity (simple LRU approximation: evict oldest entry)
	if (cache.size >= MAX_SIZE) {
		const firstKey = cache.keys().next().value
		if (firstKey != null) {
			cache.delete(firstKey)
		}
	}

	const tier: Tier = customerStore.get(customerId) ?? 'solo'
	cache.set(customerId, { tier, expiresAt: now + CACHE_TTL_MS })
	return tier
}
