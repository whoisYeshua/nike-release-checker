import { createHmac } from 'node:crypto'
import { webhookDeliveriesDb } from '../db/webhookDeliveries.ts'
import { webhooksDb } from '../db/webhooks.ts'
import type { DeliveryRow } from '../db/types.ts'

export const TIMEOUT_MS = 10_000
export const MAX_BACKOFF_MS = 60 * 60 * 1000 // 1 hour
export const TOTAL_RETRY_BUDGET_MS = 24 * 60 * 60 * 1000 // 24 hours
const JITTER_MS = 5_000

/**
 * Compute the HMAC-SHA256 hex signature for a raw body string.
 * Header value: `sha256=<hex>`
 */
export function computeSignature(secret: string, rawBody: string): string {
  const hex = createHmac('sha256', secret).update(rawBody).digest('hex')
  return `sha256=${hex}`
}

/** Fetch injected at module level so tests can replace it. */
export let fetchImpl: typeof fetch = globalThis.fetch

/** Replace the fetch implementation (for testing). */
export function setFetchImpl(impl: typeof fetch): void {
  fetchImpl = impl
}

/**
 * Deliver a single outbox row.
 */
export async function deliver(row: DeliveryRow): Promise<void> {
  const webhook = webhooksDb.findById(row.webhook_id)
  if (!webhook) {
    // Orphaned delivery (webhook deleted) — mark done with status -1
    webhookDeliveriesDb.markDeadLetter(row.id)
    return
  }

  const body = JSON.stringify(row.payload_json)
  const sig = computeSignature(webhook.secret, body)

  let status = -1
  try {
    const res = await fetchImpl(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NikeBot-Signature': sig,
        'X-NikeBot-Event': row.event_type,
        'X-NikeBot-Delivery': row.id,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = res.status
  } catch {
    // Network error / timeout → status stays -1 (treated as retryable)
  }

  const success = status >= 200 && status < 300
  // 4xx that are NOT 408/429 are customer errors — no retry
  const dontRetry =
    status >= 400 && status < 500 && status !== 408 && status !== 429

  if (success || dontRetry) {
    webhookDeliveriesDb.markDone(row.id, status)
    return
  }

  // Retryable: 5xx, 408, 429, network error (status === -1)
  const elapsed = Date.now() - row.created_at.getTime()
  if (elapsed >= TOTAL_RETRY_BUDGET_MS) {
    webhookDeliveriesDb.markDeadLetter(row.id)
    return
  }

  // Backoff: min(2^(attempt_count-1) * 30s, 1h) + jitter
  // attempt_count was already incremented by claimDue
  const backoff =
    Math.min(
      Math.pow(2, row.attempt_count - 1) * 30_000,
      MAX_BACKOFF_MS,
    ) + Math.floor(Math.random() * JITTER_MS)
  webhookDeliveriesDb.reschedule(row.id, new Date(Date.now() + backoff))
}

/**
 * One dispatcher tick: claim pending rows and deliver in parallel.
 */
export async function tick(): Promise<void> {
  const batch = webhookDeliveriesDb.claimDue(50)
  await Promise.all(batch.map(deliver))
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

/** Start the background polling loop (call once at process startup). */
export function startWorker(intervalMs = 1_000): void {
  if (intervalHandle !== null) return
  intervalHandle = setInterval(() => {
    void tick()
  }, intervalMs)
}

/** Stop the background polling loop (for graceful shutdown / tests). */
export function stopWorker(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
