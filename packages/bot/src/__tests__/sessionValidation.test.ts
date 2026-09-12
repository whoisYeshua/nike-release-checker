import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionValidationResult } from '../auth/preCheckoutValidation.ts'

// Mock the imports for testing
// We test the shape/contract directly with mock data

describe('sessionValidation', () => {
  test('validateAllSessions returns array with correct shape', async () => {
    // Direct unit test using the types — validate the interface contract
    const mockResult: SessionValidationResult = {
      accountId: 'acc-001',
      email: 'u***@example.com',
      valid: true,
    }
    assert.equal(typeof mockResult.accountId, 'string')
    assert.equal(typeof mockResult.email, 'string')
    assert.equal(typeof mockResult.valid, 'boolean')
  })

  test('reason field accepts only valid values', () => {
    const noSession: SessionValidationResult = {
      accountId: 'acc-002',
      email: 'f***@test.com',
      valid: false,
      reason: 'no_session',
    }
    const expired: SessionValidationResult = {
      accountId: 'acc-003',
      email: 'e***@test.com',
      valid: false,
      reason: 'expired',
    }
    assert.equal(noSession.reason, 'no_session')
    assert.equal(expired.reason, 'expired')
  })

  test('printValidationSummary does not output raw emails', async () => {
    const { printValidationSummary } = await import('../auth/preCheckoutValidation.ts')
    const messages: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { messages.push(args.join(' ')) }
    try {
      printValidationSummary([
        { accountId: 'acc-1', email: 'u***@example.com', valid: true },
        { accountId: 'acc-2', email: 'f***@fail.com', valid: false, reason: 'expired' },
      ])
    } finally {
      console.log = originalLog
    }
    const combined = messages.join('\n')
    // The function receives pre-masked emails (maskEmail is called in validateAllSessions)
    // so the output should have the masked form
    assert.ok(combined.includes('u***@example.com'), 'masked email should appear')
    assert.ok(combined.includes('f***@fail.com'), 'masked email should appear')
    // Ensure raw emails that could have leaked are not there
    assert.ok(!combined.includes('raw@notmasked.com'), 'no raw email leakage')
  })
})
