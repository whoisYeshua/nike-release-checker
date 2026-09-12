// Drop lifecycle state machine — Story 17.1

export type DropState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ARMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED'

export class InvalidDropTransitionError extends Error {
  public readonly from: DropState
  public readonly to: DropState

  constructor(from: DropState, to: DropState) {
    super(`Invalid drop transition: ${from} -> ${to}`)
    this.name = 'InvalidDropTransitionError'
    this.from = from
    this.to = to
  }
}

/**
 * Allowed transitions map.
 * ARCHIVED is terminal — no outgoing transitions.
 * COMPLETED/CANCELLED are near-terminal — only ARCHIVED is allowed.
 */
const ALLOWED: Record<DropState, readonly DropState[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED', 'ARCHIVED'],
  SCHEDULED: ['ARMED', 'CANCELLED', 'ARCHIVED'],
  ARMED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  ACTIVE: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
}

/**
 * Assert that a transition from → to is valid.
 * Throws InvalidDropTransitionError if not.
 */
export function assertTransition(from: DropState, to: DropState): void {
  if (!(ALLOWED[from] as readonly string[]).includes(to)) {
    throw new InvalidDropTransitionError(from, to)
  }
}

/**
 * Returns all valid next states from a given state.
 */
export function allowedTransitions(from: DropState): readonly DropState[] {
  return ALLOWED[from]
}

/**
 * Returns true when the state is terminal (no further transitions possible).
 */
export function isTerminal(state: DropState): boolean {
  return ALLOWED[state].length === 0
}
