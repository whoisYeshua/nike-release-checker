export type StockTransition =
  | 'became_available'
  | 'became_unavailable'
  | 'still_available'
  | 'still_unavailable'

export interface StockChange {
  transition: StockTransition
  previousSizes: string[]
  currentSizes: string[]
  newSizes: string[]     // sizes that just became available
  droppedSizes: string[] // sizes that just went OOS
}

/**
 * Tracks stock transitions between polling rounds.
 *
 * Critical invariant: the FIRST poll NEVER returns `became_available` —
 * it always returns `still_available` or `still_unavailable` to avoid
 * false-positive checkout triggers on startup.
 */
export class StockTracker {
  private previousSizes: string[] | null = null

  /**
   * Update the tracker with the latest available sizes.
   * Returns a StockChange describing what changed since the last poll.
   */
  update(currentSizes: string[]): StockChange {
    const current = new Set(currentSizes)

    // First poll — no previous state, never fire became_available
    if (this.previousSizes === null) {
      this.previousSizes = [...currentSizes]
      const transition: StockTransition = currentSizes.length > 0
        ? 'still_available'
        : 'still_unavailable'
      return {
        transition,
        previousSizes: [],
        currentSizes: [...currentSizes],
        newSizes: [],
        droppedSizes: [],
      }
    }

    const previous = new Set(this.previousSizes)

    const newSizes = currentSizes.filter((s) => !previous.has(s))
    const droppedSizes = this.previousSizes.filter((s) => !current.has(s))

    let transition: StockTransition
    if (newSizes.length > 0 && this.previousSizes.length === 0) {
      transition = 'became_available'
    } else if (droppedSizes.length > 0 && currentSizes.length === 0 && this.previousSizes.length > 0) {
      transition = 'became_unavailable'
    } else if (currentSizes.length > 0) {
      transition = 'still_available'
    } else {
      transition = 'still_unavailable'
    }

    const previousSnapshot = [...this.previousSizes]
    this.previousSizes = [...currentSizes]

    return {
      transition,
      previousSizes: previousSnapshot,
      currentSizes: [...currentSizes],
      newSizes,
      droppedSizes,
    }
  }

  /**
   * Reset the tracker to initial state.
   */
  reset(): void {
    this.previousSizes = null
  }
}
