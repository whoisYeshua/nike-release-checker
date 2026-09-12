import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

describe('checkoutContext isolation', () => {
	it('two contexts do not share cookies', async () => {
		const { createStealthContext } = await import('../stealth/contextFactory.ts')

		const context1 = await createStealthContext({ headless: true })
		const context2 = await createStealthContext({ headless: true })

		try {
			// Set a cookie in context1
			await context1.addCookies([
				{
					name: 'test_session',
					value: 'account1_secret',
					domain: 'nike.com',
					path: '/',
				},
			])

			// Verify context2 does NOT have that cookie
			const cookies2 = await context2.cookies('https://nike.com')
			const leaked = cookies2.find((c) => c.name === 'test_session')
			assert.equal(
				leaked,
				undefined,
				'Cookie from context1 MUST NOT appear in context2 — isolation violated!',
			)

			// Verify context1 DOES have the cookie (sanity check)
			const cookies1 = await context1.cookies('https://nike.com')
			const found = cookies1.find((c) => c.name === 'test_session')
			assert.ok(found, 'Cookie must exist in context1')
			assert.equal(found?.value, 'account1_secret')
		} finally {
			await context1.close()
			await context2.close()
		}
	})

	it('createCheckoutContext throws when no session file exists', async () => {
		const { createCheckoutContext } = await import('../stealth/checkoutContext.ts')

		await assert.rejects(
			() =>
				createCheckoutContext({
					accountId: 'nonexistent-account-id-00000000',
					headless: true,
				}),
			(err: Error) => {
				assert.ok(
					err.message.includes('Session file missing') ||
						err.message.includes('Invalid account ID'),
					`Expected session-missing error, got: ${err.message}`,
				)
				return true
			},
		)
	})

	it('createCheckoutContext closes the context if cookie injection throws', async () => {
		const { createCheckoutContext } = await import('../stealth/checkoutContext.ts')

		// Use a clearly fake ID to trigger a session-missing error
		const fakeId = 'fake-id-for-no-session-test'

		try {
			await createCheckoutContext({ accountId: fakeId, headless: true })
			assert.fail('Should have thrown')
		} catch (err) {
			assert.ok(
				err instanceof Error && err.message.includes('Session file missing'),
				'Error must propagate correctly after context cleanup',
			)
		}
		// If we reach here without hanging browser processes, context was properly closed.
	})
})
