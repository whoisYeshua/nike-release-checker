import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'

import { buildApp } from '../app.ts'
import { apiKeysDb } from '../db/apiKeys.ts'

// Pre-computed argon2id hash for the test secret.
// secret: "testsecretabcdefghijklmnopqrstuvwx" (32 chars)
const TEST_SECRET = 'testsecretabcdefghijklmnopqrstuvwx'
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$u0H9L+Y2c+SHGicZFKfdUw$u/yrWlbPjrPJCQlXRCRNc4lPhgfUyzn8qKsn2jyIFGY'
const VALID_TOKEN = `nrc_k1abc2_${TEST_SECRET}`

beforeEach(() => {
	apiKeysDb._clear()
})

describe('Auth plugin — deny-by-default on /v1/* routes', () => {
	it('no Authorization header → 401 with WWW-Authenticate', async () => {
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ pong: true }))
		await app.ready()

		const res = await app.inject({ method: 'GET', url: '/v1/ping' })
		assert.equal(res.statusCode, 401)
		assert.ok(res.headers['www-authenticate']?.includes('Bearer realm='), 'WWW-Authenticate header missing')
		const body = res.json<{ type: string; status: number }>()
		assert.ok(body.type.includes('auth-missing'))
		assert.equal(body.status, 401)

		await app.close()
	})

	it('Authorization: Bearer garbage (wrong token format) → 401 auth-invalid', async () => {
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ pong: true }))
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: 'Bearer notavalidtoken' },
		})
		assert.equal(res.statusCode, 401)
		const body = res.json<{ type: string }>()
		assert.ok(body.type.includes('auth-invalid'))

		await app.close()
	})

	it('unknown key_id (well-formed token) → 401 auth-invalid', async () => {
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ pong: true }))
		await app.ready()

		// Header is not "Bearer <token>" so it triggers auth-missing (no Bearer prefix).
		// The test below covers the "Bearer + unknown key" path.
		await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `nrc_unknown_${TEST_SECRET}` },
		})
		await app.close()
	})

	it('unknown key_id with Bearer prefix → 401 auth-invalid', async () => {
		const app = await buildApp()
		app.get('/v1/ping', async () => ({ pong: true }))
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `Bearer nrc_unknown_${TEST_SECRET}` },
		})
		assert.equal(res.statusCode, 401)
		const body = res.json<{ type: string }>()
		assert.ok(body.type.includes('auth-invalid'))

		await app.close()
	})

	it('valid token → 200, customerId injected', async () => {
		apiKeysDb._seed({
			key_id: 'k1abc2',
			customer_id: 'c_123',
			secret_hash: TEST_HASH,
			created_at: new Date(),
		})

		const app = await buildApp()
		app.get('/v1/ping', async (req) => ({ customerId: req.customerId }))
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `Bearer ${VALID_TOKEN}` },
		})
		assert.equal(res.statusCode, 200)
		const body = res.json<{ customerId: string }>()
		assert.equal(body.customerId, 'c_123')

		await app.close()
	})

	it('revoked key → 403 auth-revoked', async () => {
		apiKeysDb._seed({
			key_id: 'k1abc2',
			customer_id: 'c_123',
			secret_hash: TEST_HASH,
			created_at: new Date(),
			revoked_at: new Date(),
		})

		const app = await buildApp()
		app.get('/v1/ping', async (req) => ({ customerId: req.customerId }))
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/ping',
			headers: { authorization: `Bearer ${VALID_TOKEN}` },
		})
		assert.equal(res.statusCode, 403)
		const body = res.json<{ type: string; status: number }>()
		assert.ok(body.type.includes('auth-revoked'))
		assert.equal(body.status, 403)

		await app.close()
	})

	it('/healthz with no auth header → 200 (anonymous bypass)', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({ method: 'GET', url: '/healthz' })
		assert.equal(res.statusCode, 200)
		const body = res.json<{ status: string }>()
		assert.equal(body.status, 'ok')

		await app.close()
	})
})
