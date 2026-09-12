import type { DropRow } from '../db/drops.ts'

// Scheduler stub — Epic 17 replaces this with durable queue.
// In Phase 4, we log and store in-memory.

const queue: DropRow[] = []

export const scheduler = {
  async enqueue(drop: DropRow): Promise<void> {
    // TODO Epic 17: replace with durable scheduler enqueue
    queue.push(drop)
    console.log(`[scheduler] Enqueued drop ${drop.id} (state=${drop.state})`)
  },

  /** For testing only */
  _reset(): void {
    queue.length = 0
  },

  _getQueue(): DropRow[] {
    return [...queue]
  },
}
