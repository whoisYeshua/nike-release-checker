// In-memory DB types for webhook outbox pattern (Postgres migration in Story 16.x)

export interface WebhookRow {
  id: string
  customer_id: string
  url: string
  secret: string // plaintext in-memory; encrypted (BYTEA) in Postgres (Story 16.2)
  events_subscribed: string[]
  active: boolean
  created_at: Date
}

export interface DeliveryRow {
  id: string
  webhook_id: string
  customer_id: string
  event_type: string
  payload_json: Record<string, unknown>
  http_status: number | null
  attempt_count: number
  next_retry_at: Date
  delivered_at: Date | null
  created_at: Date
}

/** Lightweight transaction handle (in-memory stub; real tx in Story 16.x) */
export interface Tx {
  webhooks: {
    findActiveSubscribed(customerId: string, eventType: string): Promise<WebhookRow[]>
  }
  webhookDeliveries: {
    insert(row: Omit<DeliveryRow, 'id' | 'http_status' | 'attempt_count' | 'next_retry_at' | 'delivered_at' | 'created_at'>): Promise<DeliveryRow>
  }
}
