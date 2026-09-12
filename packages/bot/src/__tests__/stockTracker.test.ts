import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { StockTracker } from '../monitor/stockTracker.ts'

describe('StockTracker', () => {
  test('first poll with available sizes returns still_available (NOT became_available)', () => {
    const tracker = new StockTracker()
    const change = tracker.update(['40', '41', '42'])
    assert.equal(change.transition, 'still_available', 'first poll must never return became_available')
    assert.deepEqual(change.newSizes, [], 'newSizes should be empty on first poll')
  })

  test('first poll with no available sizes returns still_unavailable', () => {
    const tracker = new StockTracker()
    const change = tracker.update([])
    assert.equal(change.transition, 'still_unavailable')
  })

  test('detects became_available when OOS → in-stock transition occurs', () => {
    const tracker = new StockTracker()
    tracker.update([]) // first poll: OOS
    const change = tracker.update(['40', '41']) // second poll: in stock
    assert.equal(change.transition, 'became_available')
    assert.deepEqual(change.newSizes.sort(), ['40', '41'])
  })

  test('detects became_unavailable when in-stock → OOS transition occurs', () => {
    const tracker = new StockTracker()
    tracker.update(['40', '41']) // first poll: in stock
    const change = tracker.update([]) // second poll: OOS
    assert.equal(change.transition, 'became_unavailable')
    assert.deepEqual(change.droppedSizes.sort(), ['40', '41'])
  })

  test('returns still_available when sizes remain available', () => {
    const tracker = new StockTracker()
    tracker.update(['40', '41']) // first poll
    const change = tracker.update(['40', '41']) // same sizes
    assert.equal(change.transition, 'still_available')
  })

  test('returns still_unavailable when no sizes across multiple polls', () => {
    const tracker = new StockTracker()
    tracker.update([]) // first poll
    const change = tracker.update([]) // second poll: still OOS
    assert.equal(change.transition, 'still_unavailable')
  })

  test('tracks new sizes in newSizes when some sizes appear', () => {
    const tracker = new StockTracker()
    tracker.update(['40']) // first poll: size 40 available
    const change = tracker.update(['40', '41']) // size 41 appears
    assert.ok(change.newSizes.includes('41'), 'size 41 should be in newSizes')
    assert.ok(!change.newSizes.includes('40'), 'size 40 was already available, not new')
  })

  test('reset clears state so next poll is treated as first poll again', () => {
    const tracker = new StockTracker()
    tracker.update([]) // first poll
    tracker.update(['40']) // became_available
    tracker.reset()
    const change = tracker.update(['40']) // after reset: first poll again
    assert.equal(change.transition, 'still_available', 'after reset, should not fire became_available')
  })
})
