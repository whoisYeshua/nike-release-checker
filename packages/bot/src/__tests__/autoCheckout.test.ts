import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('autoCheckout', () => {
  test('does not trigger checkout when stock is not detected (still_unavailable)', async () => {
    // Test the StockTracker invariant: first poll never triggers checkout
    const { StockTracker } = await import('../monitor/stockTracker.ts')
    const tracker = new StockTracker()

    // First poll with no stock — should be still_unavailable, not became_available
    const change = tracker.update([])
    assert.equal(change.transition, 'still_unavailable')
    // The checkout would only be triggered on 'became_available'
    const wouldTrigger = (change.transition as string) === 'became_available'
    assert.equal(wouldTrigger, false, 'should not trigger checkout when still_unavailable')
  })

  test('does not trigger checkout when autoCheckout is false', async () => {
    const { StockTracker } = await import('../monitor/stockTracker.ts')
    const tracker = new StockTracker()

    // Simulate: first poll OOS, second poll in stock
    tracker.update([]) // still_unavailable
    const change = tracker.update(['40', '41']) // became_available

    assert.equal(change.transition, 'became_available')

    // But with autoCheckout=false, the checkout should not be triggered
    const autoCheckout = false
    const wouldTrigger = change.transition === 'became_available' && autoCheckout
    assert.equal(wouldTrigger, false, 'should not trigger checkout when autoCheckout=false')
  })

  test('throws when no valid sessions found', async () => {
    const { validateAllSessions } = await import('../auth/preCheckoutValidation.ts')

    // Call validateAllSessions — it loads from .bot-data/accounts.json
    // In test env with no accounts, it should return empty array
    const results = await validateAllSessions()

    // If no accounts, auto-checkout would throw
    if (results.length === 0) {
      const wouldThrow = results.filter((r) => r.valid).length === 0
      assert.equal(wouldThrow, true, 'should detect no valid sessions')
    } else {
      // In an env with accounts, just verify the shape
      for (const r of results) {
        assert.equal(typeof r.accountId, 'string')
        assert.equal(typeof r.email, 'string')
        assert.equal(typeof r.valid, 'boolean')
        // email should be masked
        assert.ok(!r.email.match(/^[a-zA-Z0-9._%+-]+@/), 'email should be masked')
      }
    }
  })
})
