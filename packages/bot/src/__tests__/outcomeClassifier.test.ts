import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { classifyOutcome, outcomeMessage } from '../checkout/outcomeClassifier.ts'
import type { StepResult } from '../checkout/executeStep.ts'

function step(s: string, outcome: StepResult['outcome']): StepResult {
  return { step: s, outcome, durationMs: 100 }
}

describe('outcomeClassifier', () => {
  test('returns success when all steps succeed (no 3ds-validation)', () => {
    const steps = [
      step('select-size', 'success'),
      step('add-to-cart', 'success'),
      step('submit-order', 'success'),
    ]
    assert.equal(classifyOutcome(steps), 'success')
  })

  test('returns 3ds_success when 3ds-validation step is present and succeeded', () => {
    const steps = [
      step('select-size', 'success'),
      step('3ds-validation', 'success'),
      step('submit-order', 'success'),
    ]
    assert.equal(classifyOutcome(steps), '3ds_success')
  })

  test('returns sold_out when any step has sold_out outcome', () => {
    const steps = [
      step('select-size', 'success'),
      step('add-to-cart', 'sold_out'),
    ]
    assert.equal(classifyOutcome(steps), 'sold_out')
  })

  test('returns blocked when any step has blocked outcome', () => {
    const steps = [
      step('select-size', 'blocked'),
    ]
    assert.equal(classifyOutcome(steps), 'blocked')
  })

  test('returns 3ds_timeout when any step has 3ds_timeout outcome', () => {
    const steps = [
      step('select-size', 'success'),
      step('3ds-validation', '3ds_timeout'),
    ]
    assert.equal(classifyOutcome(steps), '3ds_timeout')
  })

  test('returns timeout when any step has timeout outcome', () => {
    const steps = [
      step('navigate-checkout', 'timeout'),
    ]
    assert.equal(classifyOutcome(steps), 'timeout')
  })

  test('returns no_session when any step has no_session outcome', () => {
    const steps = [
      step('select-size', 'no_session'),
    ]
    assert.equal(classifyOutcome(steps), 'no_session')
  })

  test('returns error when any step has error outcome', () => {
    const steps = [
      step('complete-payment', 'error'),
    ]
    assert.equal(classifyOutcome(steps), 'error')
  })

  test('sold_out takes priority over later error steps', () => {
    const steps = [
      step('select-size', 'success'),
      step('add-to-cart', 'sold_out'),
      step('something', 'error'),
    ]
    assert.equal(classifyOutcome(steps), 'sold_out')
  })

  test('outcomeMessage returns non-empty string for all outcomes', () => {
    const outcomes = ['success', 'sold_out', 'blocked', '3ds_success', '3ds_timeout', 'timeout', 'no_session', 'error'] as const
    for (const outcome of outcomes) {
      const msg = outcomeMessage(outcome)
      assert.ok(typeof msg === 'string' && msg.length > 0, `outcomeMessage should return string for: ${outcome}`)
    }
  })
})
