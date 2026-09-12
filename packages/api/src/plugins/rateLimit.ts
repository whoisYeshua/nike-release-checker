/**
 * Per-tier rate limiting using a Redis sliding-window (sorted set).
 *
 * Tiers:   solo → 60 req/min  |  pro → 600 req/min  |  enterprise → unlimited
 * Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset (RFC)
 * 429 body: RFC 9457 problem-detail  +  Retry-After header
 * Fail-open: if Redis is unreachable the request is allowed through (NFR36).
 */
import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { redis } from '../db/redis.ts'
import { getTier } from '../services/customerTier.ts'

const LIMITS = { solo: 60, pro: 600, enterprise: Infinity } as const
const WINDOW_MS = 60_000

function problem(status: 429, tier: string, limit: number): Record<string, unknown> {
	return {
		type: 'https://api.nike-release-checker.com/problems/rate-limited',
		title: 'Too Many Requests',
		status,
		detail: `${tier} tier allows ${limit} req/min`,
	}
}

async function _rateLimitPlugin(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', async (req, reply) => {
		// Skip unauthenticated requests (health, docs, etc.)
		if (req.customerId == null) return

		const tier = await getTier(req.customerId)
		const limit = LIMITS[tier]

		// Enterprise = unlimited — no headers, no enforcement
		if (limit === Infinity) return

		const key = `ratelimit:${req.customerId}`
		const now = Date.now()
		const cutoff = now - WINDOW_MS

		let count: number
		try {
			const pipe = redis.multi()
			pipe.zremrangebyscore(key, 0, cutoff)
			pipe.zadd(key, now, `${now}-${randomUUID()}`)
			pipe.zcard(key)
			pipe.pexpire(key, WINDOW_MS)
			const res = await pipe.exec()
			count = res?.[2]?.[1] as number
		} catch (err) {
			req.log.warn({ err: String(err) }, 'rate_limit_redis_unavailable')
			return // fail-open
		}

		const remaining = Math.max(0, limit - count)
		const reset = Math.ceil((now + WINDOW_MS) / 1000)

		reply.header('X-RateLimit-Limit', String(limit))
		reply.header('X-RateLimit-Remaining', String(remaining))
		reply.header('X-RateLimit-Reset', String(reset))

		if (count > limit) {
			const retryAfter = Math.ceil(WINDOW_MS / 1000)
			reply.header('Retry-After', String(retryAfter))
			return reply
				.code(429)
				.type('application/problem+json')
				.send(problem(429, tier, limit))
		}
	})
}

export const rateLimitPlugin = fp(_rateLimitPlugin, { name: 'rate-limit', dependencies: ['auth'] })
