import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validate as uuidValidate } from 'uuid'

import { buildApp } from './app.ts'

describe('Fastify API gateway', () => {
	it('GET /healthz returns 200 with status ok', async () => {
		const app = await buildApp()
		const res = await app.inject({ method: 'GET', url: '/healthz' })
		assert.equal(res.statusCode, 200)
		const body = res.json<{ status: string; uptime: number; version: string }>()
		assert.equal(body.status, 'ok')
		assert.ok(typeof body.uptime === 'number')
		assert.ok(typeof body.version === 'string')
		await app.close()
	})

	it('GET /healthz echoes valid incoming X-Request-Id', async () => {
		const app = await buildApp()
		const id = '550e8400-e29b-41d4-a716-446655440000'
		const res = await app.inject({
			method: 'GET',
			url: '/healthz',
			headers: { 'x-request-id': id },
		})
		assert.equal(res.statusCode, 200)
		assert.equal(res.headers['x-request-id'], id)
		await app.close()
	})

	it('GET /healthz replaces invalid X-Request-Id with fresh UUID', async () => {
		const app = await buildApp()
		const res = await app.inject({
			method: 'GET',
			url: '/healthz',
			headers: { 'x-request-id': 'not-a-valid-uuid' },
		})
		assert.equal(res.statusCode, 200)
		const returnedId = res.headers['x-request-id']
		assert.ok(typeof returnedId === 'string')
		assert.notEqual(returnedId, 'not-a-valid-uuid')
		assert.ok(uuidValidate(returnedId))
		await app.close()
	})

	it('GET /docs/openapi.json returns valid OpenAPI 3.1 document', async () => {
		const app = await buildApp()
		await app.ready()
		const res = await app.inject({ method: 'GET', url: '/docs/openapi.json' })
		assert.equal(res.statusCode, 200)
		const spec = res.json<{ openapi: string }>()
		assert.ok(spec.openapi.startsWith('3.1'), `Expected 3.1.x, got ${spec.openapi}`)
		await app.close()
	})

	it('Thrown error returns RFC 9457 problem-detail shape', async () => {
		const app = await buildApp()
		// Register a route that throws
		app.get('/test-error', { config: { auth: 'anonymous' } }, async () => {
			throw new Error('Intentional test error')
		})
		const prevEnv = process.env['NODE_ENV']
		process.env['NODE_ENV'] = 'production'
		const res = await app.inject({ method: 'GET', url: '/test-error' })
		process.env['NODE_ENV'] = prevEnv
		assert.equal(res.statusCode, 500)
		const body = res.json<{ type: string; title: string; status: number; request_id: string }>()
		assert.ok(body.type)
		assert.ok(body.title)
		assert.equal(body.status, 500)
		assert.ok(body.request_id)
		// In prod mode, detail should not be present
		assert.ok(!('detail' in body), 'detail should not be present in production mode')
		await app.close()
	})
})
