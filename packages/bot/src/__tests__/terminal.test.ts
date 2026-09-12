import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('terminal output', () => {
  test('printCheckoutHeader does not output raw email', async () => {
    const { printCheckoutHeader } = await import('../logger/terminal.ts')
    const messages: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { messages.push(args.join(' ')) }
    try {
      printCheckoutHeader('user@example.com', false)
    } finally {
      console.log = originalLog
    }
    const combined = messages.join('\n')
    assert.ok(!combined.includes('user@example.com'), 'raw email must not appear in terminal output')
    assert.ok(combined.includes('u***@example.com'), 'masked email should appear')
  })

  test('printStepResult handles all StepOutcome types without throwing', async () => {
    const { printStepResult } = await import('../logger/terminal.ts')
    const outcomes = ['success', 'sold_out', 'blocked', '3ds_required', '3ds_timeout', 'timeout', 'no_session', 'error'] as const
    const messages: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { messages.push(args.join(' ')) }
    try {
      for (const outcome of outcomes) {
        assert.doesNotThrow(() => {
          printStepResult({ step: 'test-step', outcome, durationMs: 10 })
        }, `should handle outcome: ${outcome}`)
      }
    } finally {
      console.log = originalLog
    }
    assert.equal(messages.length, outcomes.length, 'should print one line per outcome')
  })

  test('printStepResult shows error message when error is present', async () => {
    const { printStepResult } = await import('../logger/terminal.ts')
    const messages: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { messages.push(args.join(' ')) }
    try {
      printStepResult({
        step: 'select-size',
        outcome: 'error',
        durationMs: 50,
        error: 'network timeout',
      })
    } finally {
      console.log = originalLog
    }
    const combined = messages.join('\n')
    assert.ok(combined.includes('network timeout'), 'error message should appear in output')
  })

  test('printCheckoutSummary does not output raw emails', async () => {
    const { printCheckoutSummary } = await import('../logger/terminal.ts')
    const messages: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { messages.push(args.join(' ')) }
    try {
      printCheckoutSummary([
        {
          accountEmail: 'user@example.com',
          finalOutcome: 'success',
          steps: [{ step: 'select-size', outcome: 'success', durationMs: 100 }],
          durationMs: 500,
        },
        {
          accountEmail: 'fail@example.com',
          finalOutcome: 'error',
          steps: [{ step: 'add-to-cart', outcome: 'error', durationMs: 50, error: 'network error' }],
          durationMs: 200,
        },
      ])
    } finally {
      console.log = originalLog
    }
    const combined = messages.join('\n')
    assert.ok(!combined.includes('user@example.com'), 'raw email must not appear in summary')
    assert.ok(!combined.includes('fail@example.com'), 'raw email must not appear in summary')
    assert.ok(combined.includes('u***@example.com'), 'masked email should appear')
    assert.ok(combined.includes('f***@example.com'), 'masked email should appear')
  })
})
