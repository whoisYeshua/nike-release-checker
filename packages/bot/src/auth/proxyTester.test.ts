import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

describe('testProxyConnectivity', () => {
	it('returns success:false and masked error when proxy is unreachable', async () => {
		// Use a proxy URL pointing to a non-existent host
		const { testProxyConnectivity } = await import('./proxyTester.ts')
		const result = await testProxyConnectivity('http://user:secret@127.0.0.1:19999')
		assert.equal(result.success, false)
		assert.ok(typeof result.latencyMs === 'number')
		// Error must not contain raw password
		if (result.error) {
			assert.ok(!result.error.includes('secret'), 'Error must not contain raw password')
		}
	})

	it('returns latencyMs as a non-negative number', async () => {
		const { testProxyConnectivity } = await import('./proxyTester.ts')
		const result = await testProxyConnectivity('http://u:p@127.0.0.1:19998')
		assert.ok(result.latencyMs >= 0)
	})

	it('masks proxy credentials in error message', async () => {
		const { testProxyConnectivity } = await import('./proxyTester.ts')
		const result = await testProxyConnectivity('http://myuser:mypassword@192.0.2.1:8080')
		if (result.error) {
			assert.ok(!result.error.includes('mypassword'), 'Password must not appear in error')
		}
	})
})
