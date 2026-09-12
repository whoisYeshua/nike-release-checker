import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'

import { buildApp } from '../../app.ts'
import { apiKeysDb } from '../../db/apiKeys.ts'
import { customersDb } from '../../db/customers.ts'
import { usageDb } from '../../db/usage.ts'

// Pre-computed argon2id hash for the test secret.
// secret: "testsecretabcdefghijklmnopqrstuvwx" (32 chars)
const TEST_SECRET = 'testsecretabcdefghijklmnopqrstuvwx'
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$u0H9L+Y2c+SHGicZFKfdUw$u/yrWlbPjrPJCQlXRCRNc4lPhgfUyzn8qKsn2jyIFGY'

const CUSTOMER_A_ID = 'cust-aaa-111'
const CUSTOMER_B_ID = 'cust-bbb-222'
const KEY_A = 'keya11'
const KEY_B = 'keyb22'
const TOKEN_A = `nrc_${KEY_A}_${TEST_SECRET}`
const TOKEN_B = `nrc_${KEY_B}_${TEST_SECRET}`

function authHeaders(token: string) {
	return { authorization: `Bearer ${token}` }
}

beforeEach(() => {
	apiKeysDb._clear()
	customersDb._clear()
	usageDb._clear()

	customersDb._seed({
		id: CUSTOMER_A_ID,
		email: 'alice@example.com',
		tier: 'pro',
		created_at: new Date('2024-01-01T00:00:00.000Z'),
		stripe_customer_id: 'cus_alice',
	})
	customersDb._seed({
		id: CUSTOMER_B_ID,
		email: 'bob@example.com',
		tier: 'solo',
		created_at: new Date('2024-02-01T00:00:00.000Z'),
	})

	apiKeysDb._seed({
		key_id: KEY_A,
		customer_id: CUSTOMER_A_ID,
		secret_hash: TEST_HASH,
		label: 'alice-key',
		created_at: new Date('2024-01-10T00:00:00.000Z'),
	})
	apiKeysDb._seed({
		key_id: KEY_B,
		customer_id: CUSTOMER_B_ID,
		secret_hash: TEST_HASH,
		label: 'bob-key',
		created_at: new Date('2024-02-10T00:00:00.000Z'),
	})
})

// ─── GET /v1/account ─────────────────────────────────────────────────────────

describe('GET /v1/account', () => {
	it('happy path — returns the authenticated customer record', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/account',
			headers: authHeaders(TOKEN_A),
		})

		assert.equal(res.statusCode, 200)
		const body = res.json<{ id: string; email: string; tier: string; stripe_customer_id?: string; deleted_at: null }>()
		assert.equal(body.id, CUSTOMER_A_ID)
		assert.equal(body.email, 'alice@example.com')
		assert.equal(body.tier, 'pro')
		assert.equal(body.stripe_customer_id, 'cus_alice')
		assert.equal(body.deleted_at, null)

		await app.close()
	})

	it('customer A token returns A row, not B row', async () => {
		const app = await buildApp()
		await app.ready()

		const resA = await app.inject({
			method: 'GET',
			url: '/v1/account',
			headers: authHeaders(TOKEN_A),
		})
		const resB = await app.inject({
			method: 'GET',
			url: '/v1/account',
			headers: authHeaders(TOKEN_B),
		})

		const bodyA = resA.json<{ id: string }>()
		const bodyB = resB.json<{ id: string }>()
		assert.equal(bodyA.id, CUSTOMER_A_ID)
		assert.equal(bodyB.id, CUSTOMER_B_ID)
		assert.notEqual(bodyA.id, bodyB.id)

		await app.close()
	})

	it('no auth → 401', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({ method: 'GET', url: '/v1/account' })
		assert.equal(res.statusCode, 401)

		await app.close()
	})
})

// ─── GET /v1/account/usage ───────────────────────────────────────────────────

describe('GET /v1/account/usage', () => {
	it('no orders MTD → cops_count: 0, breakdown: []', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/account/usage',
			headers: authHeaders(TOKEN_A),
		})

		assert.equal(res.statusCode, 200)
		const body = res.json<{ cops_count: number; cops_cost_cents: number; currency: string; breakdown: unknown[] }>()
		assert.equal(body.cops_count, 0)
		assert.equal(body.cops_cost_cents, 0)
		assert.equal(body.breakdown.length, 0)
		assert.match(body.currency, /^[A-Z]{3}$/)

		await app.close()
	})

	it('3 orders across 2 days → cops_count: 3, breakdown.length: 2', async () => {
		// Two orders on day1, one on day2 — all in the current UTC month
		const now = new Date()
		const year = now.getUTCFullYear()
		const month = String(now.getUTCMonth() + 1).padStart(2, '0')

		usageDb._seedOrder({
			id: 'ord-1',
			customer_id: CUSTOMER_A_ID,
			created_at: new Date(`${year}-${month}-02T10:00:00.000Z`),
			total_amount_cents: 1000,
			currency: 'USD',
			status: 'confirmed',
		})
		usageDb._seedOrder({
			id: 'ord-2',
			customer_id: CUSTOMER_A_ID,
			created_at: new Date(`${year}-${month}-02T12:00:00.000Z`),
			total_amount_cents: 1500,
			currency: 'USD',
			status: 'shipped',
		})
		usageDb._seedOrder({
			id: 'ord-3',
			customer_id: CUSTOMER_A_ID,
			created_at: new Date(`${year}-${month}-03T09:00:00.000Z`),
			total_amount_cents: 2000,
			currency: 'USD',
			status: 'delivered',
		})

		const app = await buildApp()
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/account/usage',
			headers: authHeaders(TOKEN_A),
		})

		assert.equal(res.statusCode, 200)
		const body = res.json<{ cops_count: number; breakdown: unknown[] }>()
		assert.equal(body.cops_count, 3)
		assert.equal(body.breakdown.length, 2)

		await app.close()
	})

	it('orders with status=refunded or cancelled are excluded', async () => {
		const now = new Date()

		usageDb._seedOrder({
			id: 'ord-ref',
			customer_id: CUSTOMER_A_ID,
			created_at: new Date(now.getTime() - 180_000),
			total_amount_cents: 999,
			currency: 'USD',
			status: 'refunded',
		})
		usageDb._seedOrder({
			id: 'ord-can',
			customer_id: CUSTOMER_A_ID,
			created_at: new Date(now.getTime() - 120_000),
			total_amount_cents: 888,
			currency: 'USD',
			status: 'cancelled',
		})
		usageDb._seedOrder({
			id: 'ord-ok',
			customer_id: CUSTOMER_A_ID,
			created_at: new Date(now.getTime() - 60_000),
			total_amount_cents: 500,
			currency: 'USD',
			status: 'confirmed',
		})

		const app = await buildApp()
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/account/usage',
			headers: authHeaders(TOKEN_A),
		})

		assert.equal(res.statusCode, 200)
		const body = res.json<{ cops_count: number; cops_cost_cents: number }>()
		// Only the confirmed order should count
		assert.equal(body.cops_count, 1)
		assert.equal(body.cops_cost_cents, 500)

		await app.close()
	})

	it('no auth → 401', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({ method: 'GET', url: '/v1/account/usage' })
		assert.equal(res.statusCode, 401)

		await app.close()
	})
})

// ─── GET /v1/account/api-keys ────────────────────────────────────────────────

describe('GET /v1/account/api-keys', () => {
	it('returns key metadata, never secret_hash or secret', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({
			method: 'GET',
			url: '/v1/account/api-keys',
			headers: authHeaders(TOKEN_A),
		})

		assert.equal(res.statusCode, 200)
		const body = res.json<{ data: Array<Record<string, unknown>> }>()
		assert.ok(Array.isArray(body.data))
		assert.equal(body.data.length, 1)
		assert.equal(body.data[0]?.['key_id'], KEY_A)

		// Ensure secret is NEVER in the response body (string search)
		const raw = res.body
		assert.ok(!raw.includes('secret_hash'), 'secret_hash must not appear in response')
		assert.ok(!raw.includes('"secret"'), '"secret" field must not appear in response')

		await app.close()
	})

	it('only returns keys belonging to the authenticated customer', async () => {
		const app = await buildApp()
		await app.ready()

		const resA = await app.inject({
			method: 'GET',
			url: '/v1/account/api-keys',
			headers: authHeaders(TOKEN_A),
		})
		const resB = await app.inject({
			method: 'GET',
			url: '/v1/account/api-keys',
			headers: authHeaders(TOKEN_B),
		})

		const bodyA = resA.json<{ data: Array<{ key_id: string }> }>()
		const bodyB = resB.json<{ data: Array<{ key_id: string }> }>()
		assert.equal(bodyA.data.length, 1)
		assert.equal(bodyA.data[0]?.key_id, KEY_A)
		assert.equal(bodyB.data.length, 1)
		assert.equal(bodyB.data[0]?.key_id, KEY_B)

		await app.close()
	})

	it('no auth → 401', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({ method: 'GET', url: '/v1/account/api-keys' })
		assert.equal(res.statusCode, 401)

		await app.close()
	})
})
