import { randomUUID } from 'node:crypto'
import type { WebhookRow } from './types.ts'

// In-memory store (replaced by Postgres in Story 16.x)
const store = new Map<string, WebhookRow>()

export const webhooksDb = {
  insert(
    row: Omit<WebhookRow, 'id' | 'created_at'>,
  ): WebhookRow {
    const record: WebhookRow = {
      ...row,
      id: randomUUID(),
      created_at: new Date(),
    }
    store.set(record.id, record)
    return record
  },

  findById(id: string): WebhookRow | undefined {
    return store.get(id)
  },

  findByCustomer(customerId: string): WebhookRow[] {
    return [...store.values()].filter(
      (w) => w.customer_id === customerId && w.active,
    )
  },

  findActiveSubscribed(customerId: string, eventType: string): WebhookRow[] {
    return [...store.values()].filter(
      (w) =>
        w.customer_id === customerId &&
        w.active &&
        w.events_subscribed.includes(eventType),
    )
  },

  deactivate(id: string): boolean {
    const row = store.get(id)
    if (!row) return false
    store.set(id, { ...row, active: false })
    return true
  },

  /** Hard-delete all webhook rows for a customer (GDPR purge — Story 16.5). */
  deleteByCustomer(customerId: string): void {
    for (const [id, row] of store.entries()) {
      if (row.customer_id === customerId) {
        store.delete(id)
      }
    }
  },

  /** Clears all entries — for testing only */
  _reset(): void {
    store.clear()
  },
}
