import { randomUUID } from 'node:crypto'

// In-memory store (replaced by Postgres in Story 16.x)

// Canonical state enum — extended in Story 17.1 to cover full lifecycle.
// ARMED, ARCHIVED added; FAILED kept for backwards compat with in-flight runs.
export type DropState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ARMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED'
  | 'ARCHIVED'

export interface DropRow {
  id: string
  customer_id: string
  country: string
  sku: string
  sizes: string[]
  max_accounts: number
  payment_method_id: string
  scheduled_at: string | null
  state: DropState
  created_at: string
  completed_at: string | null
}

export interface OrderRow {
  id: string
  drop_id: string
  customer_id: string
  nike_order_number: string
  total_amount_cents: number
  currency: string
  status: string
  drop_run_id: string
  created_at: string
}

export interface OrdersPage {
  data: OrderRow[]
  cursor: string | null
}

const dropsStore = new Map<string, DropRow>()
const ordersStore = new Map<string, OrderRow>()

export const dropsDb = {
  create(input: {
    customerId: string
    country: string
    sku: string
    sizes: string[]
    maxAccounts: number
    paymentMethodId: string
    scheduledAt?: string
  }): DropRow {
    const record: DropRow = {
      id: `drp_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      customer_id: input.customerId,
      country: input.country,
      sku: input.sku,
      sizes: input.sizes,
      max_accounts: input.maxAccounts,
      payment_method_id: input.paymentMethodId,
      scheduled_at: input.scheduledAt ?? null,
      state: 'DRAFT',
      created_at: new Date().toISOString(),
      completed_at: null,
    }
    dropsStore.set(record.id, record)
    return record
  },

  findById(id: string, customerId: string): DropRow | undefined {
    const row = dropsStore.get(id)
    if (!row || row.customer_id !== customerId) return undefined
    return row
  },

  /**
   * Atomic state transition. Returns updated row if the row exists with the
   * right customerId AND current state is in fromStates. Otherwise returns null.
   */
  updateState(
    id: string,
    customerId: string,
    fromStates: DropState[],
    toState: DropState,
  ): DropRow | null {
    const row = dropsStore.get(id)
    if (!row || row.customer_id !== customerId) return null
    if (!fromStates.includes(row.state)) return null
    const updated: DropRow = { ...row, state: toState }
    dropsStore.set(id, updated)
    return updated
  },

  /**
   * Count drops in ACTIVE state for a given customer.
   * Used by the scheduler concurrency cap check.
   */
  countActive(customerId: string): number {
    let count = 0
    for (const row of dropsStore.values()) {
      if (row.customer_id === customerId && row.state === 'ACTIVE') {
        count++
      }
    }
    return count
  },

  /**
   * Return all drops matching given states, ordered by scheduled_at ASC.
   * Used by the scheduler polling loop.
   */
  findByStates(states: DropState[]): DropRow[] {
    return [...dropsStore.values()]
      .filter((r) => states.includes(r.state))
      .sort((a, b) => {
        const ta = a.scheduled_at ?? a.created_at
        const tb = b.scheduled_at ?? b.created_at
        return ta.localeCompare(tb)
      })
  },

  listOrders(
    dropId: string,
    customerId: string,
    cursor: string | undefined,
    limit: number,
  ): OrdersPage {
    let all = [...ordersStore.values()].filter(
      (o) => o.drop_id === dropId && o.customer_id === customerId,
    )

    // Sort by created_at DESC, id DESC (keyset pagination)
    all.sort((a, b) => {
      const cmp = b.created_at.localeCompare(a.created_at)
      if (cmp !== 0) return cmp
      return b.id.localeCompare(a.id)
    })

    // Decode cursor
    if (cursor != null) {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8')
      const [cursorDate, cursorId] = decoded.split('|')
      if (cursorDate != null && cursorId != null) {
        const idx = all.findIndex(
          (o) => o.created_at === cursorDate && o.id === cursorId,
        )
        if (idx !== -1) {
          all = all.slice(idx + 1)
        }
      }
    }

    const page = all.slice(0, limit)
    let nextCursor: string | null = null
    if (page.length === limit && all.length > limit) {
      const last = page[page.length - 1]!
      nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString('base64')
    }

    return { data: page, cursor: nextCursor }
  },

  /**
   * Returns true if the customer has any drops in ACTIVE or SCHEDULED state.
   * Used by the GDPR delete endpoint to block deletion (Story 16.5).
   */
  hasActiveOrScheduled(customerId: string): boolean {
    for (const row of dropsStore.values()) {
      if (
        row.customer_id === customerId &&
        (row.state === 'ACTIVE' || row.state === 'SCHEDULED')
      ) {
        return true
      }
    }
    return false
  },

  /**
   * Anonymize drop rows for a customer (GDPR purge — Story 16.5).
   * SKU/sizes are not PII and are preserved. payment_method_id is cleared.
   * The customer_id FK stays intact while the customer row exists (soft-delete window).
   */
  anonymizeByCustomer(customerId: string): void {
    for (const [id, row] of dropsStore.entries()) {
      if (row.customer_id === customerId) {
        dropsStore.set(id, { ...row, payment_method_id: '' })
      }
    }
  },

  /**
   * Null out customer_id on orders for a customer (pre-hard-purge anonymisation — Story 16.5).
   * Preserves nike_order_number, total_amount_cents, currency, created_at per NFR33.
   */
  anonymizeOrdersByCustomer(customerId: string): void {
    for (const [id, order] of ordersStore.entries()) {
      if (order.customer_id === customerId) {
        // customer_id is typed as string but we store null to represent anonymized billing rows.
        // We use unknown cast because the in-memory store type predates the nullable migration.
        const anon = { ...order } as Record<string, unknown>
        anon['customer_id'] = null
        ordersStore.set(id, anon as unknown as OrderRow)
      }
    }
  },

  /** For testing only */
  _reset(): void {
    dropsStore.clear()
    ordersStore.clear()
  },

  /** Insert a test order — for testing only */
  _insertOrder(order: Omit<OrderRow, 'id' | 'created_at'>): OrderRow {
    const record: OrderRow = {
      ...order,
      id: randomUUID(),
      created_at: new Date().toISOString(),
    }
    ordersStore.set(record.id, record)
    return record
  },
}
