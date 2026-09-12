import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildApp } from '../../app.ts'

describe('OpenAPI snapshot — /v1/account/* paths', () => {
	it('GET /docs/openapi.json contains /v1/account with 200 response', async () => {
		const app = await buildApp()
		await app.ready()

		const res = await app.inject({ method: 'GET', url: '/docs/openapi.json' })
		assert.equal(res.statusCode, 200)

		const doc = res.json<{ paths: Record<string, unknown> }>()
		assert.ok(doc.paths['/v1/account'] != null, 'missing /v1/account path')
		assert.ok(doc.paths['/v1/account/usage'] != null, 'missing /v1/account/usage path')
		assert.ok(doc.paths['/v1/account/api-keys'] != null, 'missing /v1/account/api-keys path')

		const accountPath = doc.paths['/v1/account'] as { get?: { responses?: Record<string, unknown> } }
		assert.ok(accountPath.get?.responses?.['200'] != null, '/v1/account has no 200 response schema')

		const usagePath = doc.paths['/v1/account/usage'] as { get?: { responses?: Record<string, unknown> } }
		assert.ok(usagePath.get?.responses?.['200'] != null, '/v1/account/usage has no 200 response schema')

		const keysPath = doc.paths['/v1/account/api-keys'] as { get?: { responses?: Record<string, unknown> } }
		assert.ok(keysPath.get?.responses?.['200'] != null, '/v1/account/api-keys has no 200 response schema')

		await app.close()
	})
})
