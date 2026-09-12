import type { Page } from 'playwright'
import type { KpsdkToken } from './types.js'
import { getKpsdkExtractor } from './extractor.js'

type CacheKey = string // `${accountId}:${country}`

type Entry = {
	token: KpsdkToken
	expiresAt: number // Date.now() + ttl
}

export class KpsdkCache {
	private entries = new Map<CacheKey, Entry>()
	private hits = 0
	private misses = 0
	private evictions = 0
	private ttlMs: number

	constructor(ttlMs: number = 600_000) {
		this.ttlMs = ttlMs
	}

	private key(accountId: string, country: string): CacheKey {
		return `${accountId}:${country}`
	}

	get(accountId: string, country: string): KpsdkToken | null {
		if (this.ttlMs === 0) {
			this.misses++
			return null
		}
		const k = this.key(accountId, country)
		const entry = this.entries.get(k)
		if (!entry) {
			this.misses++
			return null
		}
		if (Date.now() > entry.expiresAt) {
			this.entries.delete(k)
			this.evictions++
			this.misses++
			return null
		}
		this.hits++
		return entry.token
	}

	set(accountId: string, country: string, token: KpsdkToken): void {
		if (this.ttlMs === 0) return
		this.entries.set(this.key(accountId, country), {
			token,
			expiresAt: Date.now() + this.ttlMs,
		})
	}

	invalidate(accountId: string, country: string): void {
		if (this.entries.delete(this.key(accountId, country))) this.evictions++
	}

	stats(): { size: number; hits: number; misses: number; evictions: number } {
		return {
			size: this.entries.size,
			hits: this.hits,
			misses: this.misses,
			evictions: this.evictions,
		}
	}

	clear(): void {
		this.evictions += this.entries.size
		this.entries.clear()
	}
}

// Module-level singleton holder. Set at app boot via createKpsdkCache(); tests
// reset via kpsdkCacheHolder.__resetForTest().
let _instance: KpsdkCache = new KpsdkCache()

export const kpsdkCacheHolder = {
	get instance(): KpsdkCache {
		return _instance
	},
	/** @internal Test helper — replaces the singleton with a fresh instance. */
	__resetForTest(ttlMs?: number): KpsdkCache {
		_instance = new KpsdkCache(ttlMs)
		return _instance
	},
}

/** Factory called at CLI bootstrap — reads tokenTtlMs from config. */
export function createKpsdkCache(tokenTtlMs: number = 600_000): KpsdkCache {
	_instance = new KpsdkCache(tokenTtlMs)
	return _instance
}

/** Convenience accessor to the current singleton cache. */
export const kpsdkCache: KpsdkCache = new Proxy({} as KpsdkCache, {
	get(_target, prop) {
		return (_instance as unknown as Record<string, unknown>)[prop as string]
	},
})

export async function refreshKpsdkToken(
	cache: KpsdkCache,
	accountId: string,
	country: string,
	page: Page,
): Promise<KpsdkToken | null> {
	cache.invalidate(accountId, country)
	const extractor = getKpsdkExtractor(page, country)
	const token = await extractor.getToken()
	if (token) cache.set(accountId, country, token)
	return token
}
