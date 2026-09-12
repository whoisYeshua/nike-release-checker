import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { parseProxyUrl } from '../stealth/proxyValidator.ts'

describe('parseProxyUrl', () => {
	it('parses a full proxy URL with credentials', () => {
		const result = parseProxyUrl('http://admin:secret@proxy.example.com:8080')
		assert.equal(result.server, 'http://proxy.example.com:8080')
		assert.equal(result.username, 'admin')
		assert.equal(result.password, 'secret')
	})

	it('parses a proxy URL without credentials', () => {
		const result = parseProxyUrl('http://proxy.example.com:3128')
		assert.equal(result.server, 'http://proxy.example.com:3128')
		assert.equal(result.username, undefined)
		assert.equal(result.password, undefined)
	})

	it('handles socks5 proxy URLs', () => {
		const result = parseProxyUrl('socks5://user:pass@192.168.1.100:1080')
		assert.equal(result.server, 'socks5://192.168.1.100:1080')
		assert.equal(result.username, 'user')
		assert.equal(result.password, 'pass')
	})

	it('returns undefined username/password for empty credentials', () => {
		const result = parseProxyUrl('http://:@proxy.example.com:8080')
		assert.equal(result.username, undefined)
		assert.equal(result.password, undefined)
	})
})

// testProxy is NOT tested here with a real network.
// Unit testing testProxy requires a mock BrowserContext.
describe('testProxy (mock)', () => {
	it('returns error result when page.goto throws', async () => {
		const { testProxy } = await import('../stealth/proxyValidator.ts')

		const mockContext = {
			newPage: async () => {
				throw new Error('Connection refused')
			},
		} as unknown as import('playwright').BrowserContext

		const result = await testProxy(mockContext)
		assert.equal(result.status, 'error')
		assert.ok(
			(result as { status: 'error'; reason: string }).reason.includes('Connection refused'),
		)
	})
})
