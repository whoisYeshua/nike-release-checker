// In-memory LRU cache for skuId lookups — Story 12.2.
// TTL: 10 minutes. Max 1000 entries; oldest entry (insertion order) evicted first.
// Per-process only — Story 16.x will promote to distributed cache.

const TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_SIZE = 1000

interface CacheEntry {
	skuId: string
	expiresAt: number
}

export class SkuCache {
	private readonly store = new Map<string, CacheEntry>()

	private makeKey(country: string, styleColor: string, size: string): string {
		return `${country}:${styleColor}:${size}`
	}

	get(country: string, styleColor: string, size: string): string | undefined {
		const key = this.makeKey(country, styleColor, size)
		const entry = this.store.get(key)
		if (entry === undefined) return undefined
		if (Date.now() > entry.expiresAt) {
			this.store.delete(key)
			return undefined
		}
		return entry.skuId
	}

	set(country: string, styleColor: string, size: string, skuId: string): void {
		const key = this.makeKey(country, styleColor, size)
		// LRU eviction: delete oldest entry if at capacity
		if (!this.store.has(key) && this.store.size >= MAX_SIZE) {
			const oldest = this.store.keys().next().value
			if (oldest !== undefined) this.store.delete(oldest)
		}
		// Re-insert to update insertion order (move to end)
		this.store.delete(key)
		this.store.set(key, { skuId, expiresAt: Date.now() + TTL_MS })
	}
}

/** Module-level singleton. Override in tests via the exported `skuCache` reference. */
export const skuCache = new SkuCache()
