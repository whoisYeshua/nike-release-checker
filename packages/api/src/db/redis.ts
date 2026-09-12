/**
 * Singleton Redis client.
 * URL sourced from REDIS_URL (default: redis://localhost:6379).
 * On startup, pings Redis once — logs success/failure but does NOT crash
 * (fail-open contract per NFR36).
 */
import { Redis, type Redis as IRedis } from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

function createDefaultRedis(): IRedis {
	const client = new Redis(REDIS_URL, {
		maxRetriesPerRequest: 0,
		lazyConnect: true,
		enableOfflineQueue: false,
		// Never retry — if Redis is down, we fail-open (NFR36)
		retryStrategy: () => null,
	})
	// Suppress unhandled error events so the process doesn't crash when Redis is down
	client.on('error', () => {
		// Intentionally swallowed — rate-limit hook already logs 'rate_limit_redis_unavailable'
	})
	return client
}

/** Mutable so tests can inject ioredis-mock. */
export let redis: IRedis = createDefaultRedis()

/** Replace the Redis client — tests inject ioredis-mock via this. */
export function _setRedis(instance: IRedis): void {
	redis = instance
}

/**
 * Ping Redis once at startup. Resolves regardless of outcome (fail-open).
 */
export async function pingRedis(): Promise<void> {
	try {
		await redis.connect()
		await redis.ping()
		console.info('[redis] connected')
	} catch (err) {
		console.warn('[redis] unavailable — rate-limiting will fail-open', String(err))
	}
}
