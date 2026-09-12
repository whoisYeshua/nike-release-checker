import { randomUUID } from 'node:crypto'
import type { Tx } from '../../db/types.ts'

/**
 * Emit a webhook event within a DB transaction (outbox pattern).
 *
 * Finds all active webhook subscriptions for the customer+event pair and
 * inserts a delivery row for each one — atomically with the caller's
 * transaction so no event is lost on crash.
 *
 * @param tx      Active database transaction handle
 * @param customerId  Tenant identifier
 * @param eventType   E.g. "drop.cop", "drop.fail", "order.refunded"
 * @param data        Event-specific payload — will be wrapped in the envelope
 */
export async function emit(
  tx: Tx,
  customerId: string,
  eventType: string,
  data: object,
): Promise<void> {
  const subs = await tx.webhooks.findActiveSubscribed(customerId, eventType)
  for (const w of subs) {
    await tx.webhookDeliveries.insert({
      webhook_id: w.id,
      customer_id: customerId,
      event_type: eventType,
      payload_json: {
        id: randomUUID(),
        type: eventType,
        created_at: new Date().toISOString(),
        data,
      },
    })
  }
}
