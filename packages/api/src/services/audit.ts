import type { FastifyRequest } from 'fastify'

// Audit log service — Story 16.5 adds redactCustomerPayloads.
// Failure to write must NOT fail the request.

// ---------------------------------------------------------------------------
// In-memory audit log store (replaced by Postgres in production)
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string
  customer_id: string | null
  actor: string | null
  action: string
  resource_type: string
  resource_id: string
  payload_redacted_json: string | null
  created_at: Date
}

let _nextId = 1
const auditStore: AuditLogRow[] = []

const PII_FIELDS = new Set([
  'paymentMethodId',
  'payment_method_id',
  'secret',
  'password',
  'token',
  'card_number',
  'cvv',
  'expiry',
  'holder_name',
  'email',
  'proxy_url',
])

function redact(body: unknown): unknown {
  if (body == null || typeof body !== 'object') return body
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    result[k] = PII_FIELDS.has(k) ? '[REDACTED]' : v
  }
  return result
}

export const audit = {
  log(req: FastifyRequest, action: string, resourceId: string, extra?: Record<string, unknown>): void {
    try {
      const row: AuditLogRow = {
        id: String(_nextId++),
        customer_id: req.customerId ?? null,
        actor: req.apiKeyId ?? null,
        action,
        resource_type: action.includes('.') ? (action.split('.')[0] ?? 'resource') : 'resource',
        resource_id: resourceId,
        payload_redacted_json: JSON.stringify({
          ...(redact(req.body as unknown) as Record<string, unknown>),
          ...(extra ?? {}),
        }),
        created_at: new Date(),
      }
      auditStore.push(row)
      req.log.info({
        audit: true,
        customer_id: req.customerId,
        actor: req.apiKeyId,
        action,
        resource_type: action.includes('.') ? (action.split('.')[0] ?? 'resource') : 'resource',
        resource_id: resourceId,
        payload_redacted: redact(req.body as unknown),
        ...(extra != null ? { payload_extra: extra } : {}),
      })
    } catch (err) {
      req.log.warn({ err }, 'audit.log failed — non-blocking')
    }
  },

  /**
   * Write an audit log entry without a FastifyRequest context.
   * Used by background jobs and GDPR delete flow.
   */
  logDirect(entry: {
    customerId: string | null
    actor: string | null
    action: string
    resourceId: string
    extra?: Record<string, unknown>
  }): void {
    const row: AuditLogRow = {
      id: String(_nextId++),
      customer_id: entry.customerId,
      actor: entry.actor,
      action: entry.action,
      resource_type: 'customer',
      resource_id: entry.resourceId,
      payload_redacted_json: entry.extra != null ? JSON.stringify(entry.extra) : null,
      created_at: new Date(),
    }
    auditStore.push(row)
  },

  /**
   * Redact payload_redacted_json for all audit log rows belonging to a customer.
   * Called during PII purge (Task 3 of Story 16.5). The action history row itself
   * is preserved (customer_id stays until hard-purge, then ON DELETE SET NULL).
   */
  redactCustomerPayloads(customerId: string): void {
    for (const row of auditStore) {
      if (row.customer_id === customerId && row.payload_redacted_json != null) {
        row.payload_redacted_json = '[GDPR_PURGED]'
      }
    }
  },

  /**
   * Return audit rows for a customer — for testing only.
   */
  _findByCustomer(customerId: string): AuditLogRow[] {
    return auditStore.filter((r) => r.customer_id === customerId)
  },

  /** Find rows by action — for testing only. */
  _findByAction(action: string): AuditLogRow[] {
    return auditStore.filter((r) => r.action === action)
  },

  /** Clear store — for testing only. */
  _clear(): void {
    auditStore.length = 0
    _nextId = 1
  },
}
