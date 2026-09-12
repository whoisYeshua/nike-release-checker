/**
 * In-memory stub for the usage / orders repository.
 * Story 16.x will replace this with a real Postgres implementation
 * (query mirrors the SQL spec in Story 15.6 Task 2).
 */

export interface OrderRow {
	id: string
	customer_id: string
	created_at: Date
	total_amount_cents: number
	currency: string
	/** 'confirmed' | 'shipped' | 'delivered' | 'refunded' | 'cancelled' */
	status: string
}

export interface UsageDayRow {
	day: Date
	cops: number
	cost_cents: number
	currency: string
}

const BILLABLE_STATUSES = new Set(['confirmed', 'shipped', 'delivered'])

const ordersStore: OrderRow[] = []

export const usageDb = {
	/**
	 * Aggregate orders for a customer within [start, end).
	 * Mirrors:
	 *   SELECT date_trunc('day', created_at), COUNT(*), SUM(total_amount_cents), MIN(currency)
	 *   FROM orders WHERE customer_id = $1 AND created_at >= start AND status IN (...)
	 *   GROUP BY day ORDER BY day
	 */
	aggregate(customerId: string, start: Date, end: Date): UsageDayRow[] {
		const filtered = ordersStore.filter(
			(o) =>
				o.customer_id === customerId &&
				o.created_at >= start &&
				o.created_at < end &&
				BILLABLE_STATUSES.has(o.status),
		)

		// Group by calendar day (UTC)
		const byDay = new Map<string, { cops: number; cost_cents: number; currency: string; date: Date }>()
		for (const o of filtered) {
			const dayKey = o.created_at.toISOString().slice(0, 10) // YYYY-MM-DD
			const existing = byDay.get(dayKey)
			if (existing == null) {
				byDay.set(dayKey, {
					cops: 1,
					cost_cents: o.total_amount_cents,
					currency: o.currency,
					date: new Date(dayKey + 'T00:00:00.000Z'),
				})
			} else {
				existing.cops += 1
				existing.cost_cents += o.total_amount_cents
			}
		}

		return Array.from(byDay.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, v]) => ({ day: v.date, cops: v.cops, cost_cents: v.cost_cents, currency: v.currency }))
	},

	/** Seed orders for testing. */
	_seedOrder(row: OrderRow): void {
		ordersStore.push(row)
	},

	/** Clear all orders — used between tests. */
	_clear(): void {
		ordersStore.length = 0
	},
}
