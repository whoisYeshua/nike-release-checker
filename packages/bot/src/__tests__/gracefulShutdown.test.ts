import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('gracefulShutdown', () => {
  test('registerContext and unregisterContext do not throw', async () => {
    const { registerContext, unregisterContext } = await import('../daemon/gracefulShutdown.ts')

    // Create a minimal mock BrowserContext
    const mockCtx = {
      close: async () => {},
    } as unknown as import('playwright').BrowserContext

    assert.doesNotThrow(() => registerContext(mockCtx))
    assert.doesNotThrow(() => unregisterContext(mockCtx))
  })

  test('setupGracefulShutdown registers SIGINT and SIGTERM handlers', async () => {
    const { setupGracefulShutdown } = await import('../daemon/gracefulShutdown.ts')

    const controller = new AbortController()

    assert.doesNotThrow(() => setupGracefulShutdown(controller))

    // Verify that SIGINT and SIGTERM handlers are registered
    const sigintListeners = process.listenerCount('SIGINT')
    const sigtermListeners = process.listenerCount('SIGTERM')

    assert.ok(sigintListeners > 0, 'SIGINT handler should be registered')
    assert.ok(sigtermListeners > 0, 'SIGTERM handler should be registered')

    // Cleanup — remove the handlers to avoid interfering with other tests
    process.removeAllListeners('SIGINT')
    process.removeAllListeners('SIGTERM')
  })
})
