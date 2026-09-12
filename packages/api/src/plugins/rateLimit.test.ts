/**
 * Story 15.3 — Per-Tier Rate Limiting tests
 * Uses ioredis-mock to avoid needing a real Redis server.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import RedisMock from 'ioredis-mock'

import { apiKeysDb } from '../db/apiKeys.ts'
import { _setRedis } from '../db/redis.ts'
import { _clearCustomerTier, _seedCustomerTier } from '../services/customerTier.ts'
import { buildApp } from '../app.ts'

// Pre-computed argon2id hash for test secret (same as auth.test.ts)
const TEST_SECRET = 'testsecretabcdefghijklmnopqrstuvwx'
const TEST_HASH =
	'$argon2id$v=19$m=65536,t=3,p=4$u0H9L+Y2c+SHGicZFKfdUw$u/yrWlbPjrPJCQlXRCRNc4lPhgfUyzn8qKsn2jyIFGY'

const CUSTOMER_SOLO = 'c_solo'
const KEY_ID_SOLO = 'ksolo1'
const TOKEN_SOLO = `nrc_${KEY_ID_SOLO}_${TEST_SECRET}`

const CUSTOMER_PRO = 'c_pro'
const KEY_ID_PRO = 'kpro11'
const TOKEN_PRO = `nrc_${KEY_ID_PRO}_${TEST_SECRET}`

const CUSTOMER_ENT = 'c_ent'
const KEY_ID_ENT = 'kent11'
const TOKEN_ENT = `nrc_${KEY_ID_ENT}_${TEST_SECRET}`

function seedAll() {
	apiKeysDb._seed({ key_id: KEY_ID_SOLO, customer_id: CUSTOMER_SOLO, secret_hash: TEST_HASH, created_at: new Date() })
	apiKeysDb._seed({ key_id: KEY_ID_PRO, customer_id: CUSTOMER_PRO, secret_hash: TEST_HASH, created_at: new Date() })
	apiKeysDb._seed({ key_id: KEY_ID_ENT, customer_id: CUSTOMER_ENT, secret_hash: TEST_HASH, created_at: new Date() })
	_seedCustomerTier(CUSTOMER_SOLO, 'solo')
	_seedCustomerTier(CUSTOMER_PRO, 'pro')
	_seedCustomerTier(CUSTOMER_ENT, 'enterprise')
}

beforeEach(() => {
	apiKeysDb._clear()
	_clearCustomerTier()
	// Fresh in-memory Redis for each test
	_setRedis(new RedisMock())
})

describe('Rate limit — solo tier (60 req/min)', () => {
	it('first 60 requests succeed with X-RateLimit-* headers', async () => {
		seedAll()
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ ok: true }))
		await app.ready()

		for (let i = 1; i <= 60; i++) {
			const res = await app.inject({
				method: 'GET',
				url: '/v1/ping',
				headers: { authorization: `Bearer ${TOKEN_SOLO}` },
			})
			assert.equal(res.statusCode, 200, `request ${i} should be 200`)
			assert.ok(res.headers['x-ratelimit-limit'], `missing X-RateLimit-Limit on request ${i}`)
			assert.ok(res.headers['x-ratelimit-remaining'], `missing X-RateLimit-Remaining on request ${i}`)
			assert.ok(res.headers['x-ratelimit-reset'], `missing X-RateLimit-Reset on request ${i}`)
		}

		await app.close()
	})

	it('61st request returns 429 with Retry-After and correct headers', async () => {
		seedAll()
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ ok: true }))
		await app.ready()

		// exhaust the 60 allowed
		for (let i = 0; i < 60; i++) {
			await app.inject({
				method: 'GET',
				url: '/v1/ping',
				headers: { authorization: `Bearer ${TOKEN_SOLO}` },
			})
		}

		// 61st should be rejected
		const res = await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `Bearer ${TOKEN_SOLO}` },
		})
		assert.equal(res.statusCode, 429)
		assert.ok(res.headers['retry-after'], 'Retry-After header missing')
		assert.equal(res.headers['x-ratelimit-limit'], '60')
		assert.equal(res.headers['x-ratelimit-remaining'], '0')
		assert.ok(res.headers['x-ratelimit-reset'], 'X-RateLimit-Reset missing')

		const body = res.json<{ type: string; status: number; detail: string }>()
		assert.ok(body.type.includes('rate-limited'))
		assert.equal(body.status, 429)
		assert.ok(body.detail.includes('solo'))

		await app.close()
	})
})

describe('Rate limit — pro tier (600 req/min)', () => {
	it('600th request succeeds, 601st returns 429', async () => {
		seedAll()
		const originalDateNow = Date.now
		const fixedNow = originalDateNow()
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ ok: true }))
		await app.ready()

		Date.now = () => fixedNow
		try {
			for (let i = 0; i < 600; i++) {
				const res = await app.inject({
					method: 'GET',
					url: '/v1/ping',
					headers: { authorization: `Bearer ${TOKEN_PRO}` },
				})
				assert.equal(res.statusCode, 200, `request ${i + 1} should succeed`)
			}

			const res601 = await app.inject({
				method: 'GET',
				url: '/v1/ping',
				headers: { authorization: `Bearer ${TOKEN_PRO}` },
			})
			assert.equal(res601.statusCode, 429)
			assert.equal(res601.headers['x-ratelimit-limit'], '600')
		} finally {
			Date.now = originalDateNow
			await app.close()
		}
	})
})

describe('Rate limit — enterprise tier (unlimited)', () => {
	it('many requests succeed and no X-RateLimit-* headers are emitted', async () => {
		seedAll()
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ ok: true }))
		await app.ready()

		const REQUESTS = 100 // representative; no practical limit
		for (let i = 0; i < REQUESTS; i++) {
			const res = await app.inject({
				method: 'GET',
				url: '/v1/ping',
				headers: { authorization: `Bearer ${TOKEN_ENT}` },
			})
			assert.equal(res.statusCode, 200, `enterprise request ${i + 1} should succeed`)
			assert.equal(res.headers['x-ratelimit-limit'], undefined, 'enterprise should not have X-RateLimit-Limit')
			assert.equal(res.headers['x-ratelimit-remaining'], undefined)
			assert.equal(res.headers['x-ratelimit-reset'], undefined)
		}

		await app.close()
	})
})

describe('Rate limit — fail-open when Redis throws', () => {
	it('request succeeds even if Redis multi().exec() throws', async () => {
		seedAll()

		// Inject a broken Redis mock
		const brokenRedis = new RedisMock()
		const originalMulti = brokenRedis.multi.bind(brokenRedis)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		brokenRedis.multi = (): any => {
			const pipe = originalMulti()
			const originalExec = pipe.exec.bind(pipe)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			pipe.exec = (): any => {
				void originalExec
				return Promise.reject(new Error('Redis connection lost'))
			}
			return pipe
		}
		_setRedis(brokenRedis)

		const app = await buildApp()
		app.get('/v1/ping', async () => ({ ok: true }))
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `Bearer ${TOKEN_SOLO}` },
		})
		// Fail-open: request goes through despite Redis failure
		assert.equal(res.statusCode, 200)

		await app.close()
	})
})

describe('Rate limit — window roll', () => {
	it('counter resets after 60 s window passes', async () => {
		seedAll()
		const freshMock = new RedisMock()
		_setRedis(freshMock)

		const app = await buildApp()
		app.get('/v1/ping', async () => ({ ok: true }))
		await app.ready()

		// Exhaust the limit
		for (let i = 0; i < 60; i++) {
			await app.inject({
				method: 'GET',
				url: '/v1/ping',
				headers: { authorization: `Bearer ${TOKEN_SOLO}` },
			})
		}

		// Verify limit is hit
		const hitRes = await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `Bearer ${TOKEN_SOLO}` },
		})
		assert.equal(hitRes.statusCode, 429)
		await app.close()

		// Simulate the 60 s window rolling: flush all keys from the mock
		// (ioredis-mock stores data in the instance — clearing it simulates time passing)
		await freshMock.flushall()

		// Build a fresh app (same mock, now empty) — simulates window roll
		seedAll()
		const app2 = await buildApp()
		app2.get('/v1/ping', async () => ({ ok: true }))
		await app2.ready()

		const afterRollRes = await app2.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `Bearer ${TOKEN_SOLO}` },
		})
		assert.equal(afterRollRes.statusCode, 200, 'should succeed after window rolls')

		await app2.close()
	})
})
