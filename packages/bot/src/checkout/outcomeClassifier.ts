import type { StepResult } from './executeStep.ts'

export type FinalOutcome =
  | 'success'
  | 'sold_out'
  | 'blocked'
  | '3ds_success'
  | '3ds_timeout'
  | 'timeout'
  | 'no_session'
  | 'error'

export function classifyOutcome(steps: StepResult[]): FinalOutcome {
  for (const step of steps) {
    switch (step.outcome) {
      case 'sold_out': return 'sold_out'
      case 'blocked': return 'blocked'
      case '3ds_timeout': return '3ds_timeout'
      case '3ds_required': return 'error' // 3DS was required but never resolved — treat as error
      case 'timeout': return 'timeout'
      case 'no_session': return 'no_session'
      case 'error': return 'error'
    }
  }
  const threeDSStep = steps.find((s) => s.step === '3ds-validation' && s.outcome === 'success')
  if (threeDSStep !== undefined) return '3ds_success'
  return 'success'
}

export function outcomeMessage(outcome: FinalOutcome): string {
  switch (outcome) {
    case 'success': return 'Order placed successfully'
    case 'sold_out': return 'Product is sold out'
    case 'blocked': return 'Request was blocked (bot detection)'
    case '3ds_success': return 'Order placed after 3DS verification'
    case '3ds_timeout': return '3DS challenge timed out'
    case 'timeout': return 'Step timed out'
    case 'no_session': return 'No valid session — please login first'
    case 'error': return 'An unexpected error occurred'
    default: {
      // Defensive: unknown outcome should never happen with proper typing,
      // but guards against unsafe `as` casts feeding invalid values.
      const _exhaustive: never = outcome
      return `Unknown outcome: ${_exhaustive}`
    }
  }
}
