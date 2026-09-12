import { randomUUID } from 'node:crypto'
import type { DeliveryRow } from './types.ts'

// In-memory outbox store (replaced by Postgres in Story 16.x)
const store = new Map<string, DeliveryRow>()

export const webhookDeliveriesDb = {
  insert(
    row: Omit<DeliveryRow, 'id' | 'http_status' | 'attempt_count' | 'next_retry_at' | 'delivered_at' | 'created_at'>,
  ): DeliveryRow {
    const record: DeliveryRow = {
      ...row,
      id: randomUUID(),
      http_status: null,
      attempt_count: 0,
      next_retry_at: new Date(),
      delivered_at: null,
      created_at: new Date(),
    }
    store.set(record.id, record)
    return record
  },

  /**
   * Claim up to `limit` pending rows (next_retry_at <= now, not delivered, not DLQ).
   * Atomically increments attempt_count — emulates SELECT … FOR UPDATE SKIP LOCKED.
   * In Postgres (Story 16.x) this becomes a real CTE with row-locking.
   */
  claimDue(limit: number): DeliveryRow[] {
    const now = new Date()
    const due: DeliveryRow[] = []
    for (const row of store.values()) {
      if (
        row.delivered_at === null &&
        row.http_status !== -1 &&
        row.next_retry_at <= now
      ) {
        // Increment attempt_count immediately (emulates UPDATE in claim CTE)
        const updated: DeliveryRow = { ...row, attempt_count: row.attempt_count + 1 }
        store.set(row.id, updated)
        due.push(updated)
        if (due.length >= limit) break
      }
    }
    return due
  },

  markDone(id: string, httpStatus: number): void {
    const row = store.get(id)
    if (!row) return
    store.set(id, { ...row, delivered_at: new Date(), http_status: httpStatus })
  },

  markDeadLetter(id: string): void {
    const row = store.get(id)
    if (!row) return
    store.set(id, { ...row, http_status: -1 })
  },

  reschedule(id: string, nextRetryAt: Date): void {
    const row = store.get(id)
    if (!row) return
    store.set(id, { ...row, next_retry_at: nextRetryAt })
  },

  findById(id: string): DeliveryRow | undefined {
    return store.get(id)
  },

  /** List DLQ entries for a customer */
  listDeadLetter(customerId: string): DeliveryRow[] {
    return [...store.values()].filter(
      (r) => r.customer_id === customerId && r.http_status === -1,
    )
  },

  /** Clears all entries — for testing only */
  _reset(): void {
    store.clear()
  },
}
