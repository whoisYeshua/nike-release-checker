import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  type DropState,
  InvalidDropTransitionError,
  allowedTransitions,
  assertTransition,
  isTerminal,
} from './dropStateMachine.ts'

// ---------------------------------------------------------------------------
// Legal transitions
// ---------------------------------------------------------------------------

describe('assertTransition — legal paths', () => {
  const legalPaths: Array<[DropState, DropState]> = [
    ['DRAFT', 'SCHEDULED'],
    ['DRAFT', 'CANCELLED'],
    ['DRAFT', 'ARCHIVED'],
    ['SCHEDULED', 'ARMED'],
    ['SCHEDULED', 'CANCELLED'],
    ['SCHEDULED', 'ARCHIVED'],
    ['ARMED', 'ACTIVE'],
    ['ARMED', 'CANCELLED'],
    ['ARMED', 'ARCHIVED'],
    ['ACTIVE', 'COMPLETED'],
    ['ACTIVE', 'ARCHIVED'],
    ['COMPLETED', 'ARCHIVED'],
    ['CANCELLED', 'ARCHIVED'],
  ]

  for (const [from, to] of legalPaths) {
    it(`allows ${from} → ${to}`, () => {
      assert.doesNotThrow(() => assertTransition(from, to))
    })
  }
})

// ---------------------------------------------------------------------------
// Illegal transitions
// ---------------------------------------------------------------------------

describe('assertTransition — illegal transitions', () => {
  const illegalPaths: Array<[DropState, DropState]> = [
    // Skip states
    ['DRAFT', 'ARMED'],
    ['DRAFT', 'ACTIVE'],
    ['DRAFT', 'COMPLETED'],
    ['SCHEDULED', 'ACTIVE'],
    ['SCHEDULED', 'COMPLETED'],
    ['ARMED', 'COMPLETED'],
    // Backwards
    ['SCHEDULED', 'DRAFT'],
    ['ACTIVE', 'DRAFT'],
    ['ACTIVE', 'SCHEDULED'],
    ['COMPLETED', 'DRAFT'],
    ['CANCELLED', 'DRAFT'],
    // Self-transitions not allowed
    ['DRAFT', 'DRAFT'],
    ['ACTIVE', 'ACTIVE'],
  ]

  for (const [from, to] of illegalPaths) {
    it(`rejects ${from} → ${to}`, () => {
      assert.throws(
        () => assertTransition(from, to),
        (err: unknown) => {
          assert.ok(err instanceof InvalidDropTransitionError)
          assert.equal(err.from, from)
          assert.equal(err.to, to)
          assert.ok(err.message.includes(from))
          assert.ok(err.message.includes(to))
          return true
        },
      )
    })
  }
})

// ---------------------------------------------------------------------------
// Terminal states — ARCHIVED has no outgoing transitions
// ---------------------------------------------------------------------------

describe('ARCHIVED is terminal', () => {
  const allStates: DropState[] = [
    'DRAFT', 'SCHEDULED', 'ARMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED',
  ]

  for (const to of allStates) {
    it(`ARCHIVED → ${to} throws`, () => {
      assert.throws(
        () => assertTransition('ARCHIVED', to),
        InvalidDropTransitionError,
      )
    })
  }

  it('isTerminal returns true for ARCHIVED', () => {
    assert.equal(isTerminal('ARCHIVED'), true)
  })

  it('isTerminal returns false for non-terminal states', () => {
    const nonTerminal: DropState[] = ['DRAFT', 'SCHEDULED', 'ARMED', 'ACTIVE', 'COMPLETED', 'CANCELLED']
    for (const s of nonTerminal) {
      assert.equal(isTerminal(s), false, `Expected ${s} to be non-terminal`)
    }
  })
})

// ---------------------------------------------------------------------------
// allowedTransitions helper
// ---------------------------------------------------------------------------

describe('allowedTransitions', () => {
  it('DRAFT can go to SCHEDULED, CANCELLED, ARCHIVED', () => {
    const transitions = allowedTransitions('DRAFT')
    assert.deepEqual([...transitions].sort(), ['ARCHIVED', 'CANCELLED', 'SCHEDULED'])
  })

  it('ARCHIVED has no allowed transitions', () => {
    assert.equal(allowedTransitions('ARCHIVED').length, 0)
  })
})

// ---------------------------------------------------------------------------
// Error identity
// ---------------------------------------------------------------------------

describe('InvalidDropTransitionError', () => {
  it('has correct name and message', () => {
    const err = new InvalidDropTransitionError('DRAFT', 'ACTIVE')
    assert.equal(err.name, 'InvalidDropTransitionError')
    assert.equal(err.message, 'Invalid drop transition: DRAFT -> ACTIVE')
    assert.equal(err.from, 'DRAFT')
    assert.equal(err.to, 'ACTIVE')
    assert.ok(err instanceof Error)
    assert.ok(err instanceof InvalidDropTransitionError)
  })
})
