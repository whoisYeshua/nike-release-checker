/**
 * In-memory stub for the customers repository.
 * Story 16.x will replace this with a real Postgres implementation.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { provisionDek } from '../crypto/dek.ts'

export interface CustomerRow {
	id: string
	email: string
	tier: 'solo' | 'pro' | 'enterprise'
	created_at: Date
	stripe_customer_id?: string
	deleted_at?: Date
	default_currency?: string
	/** KMS-wrapped IKM for DEK derivation (Story 16.2) */
	dek_wrapped?: Buffer
	/** Per-customer 32-byte HKDF salt (Story 16.2) */
	dek_salt?: Buffer
}

export interface CreateCustomerInput {
	email: string
	tier?: 'solo' | 'pro' | 'enterprise'
	stripe_customer_id?: string
	default_currency?: string
}

const store = new Map<string, CustomerRow>()

export const customersDb = {
	findById(id: string): CustomerRow | undefined {
		return store.get(id)
	},

	/**
	 * Create a new customer row and provision a per-customer DEK via KMS.
	 * The `dek_wrapped` and `dek_salt` are persisted in the same logical
	 * "transaction" as the customer row (Story 16.2).
	 */
	async create(input: CreateCustomerInput): Promise<CustomerRow> {
		const id = randomUUID()
		const { dek_wrapped, dek_salt } = await provisionDek(id)
		const row: CustomerRow = {
			id,
			email: input.email,
			tier: input.tier ?? 'solo',
			stripe_customer_id: input.stripe_customer_id,
			default_currency: input.default_currency ?? 'USD',
			created_at: new Date(),
			dek_wrapped,
			dek_salt,
		}
		store.set(id, row)
		return row
	},

	/** Soft-delete a customer: sets deleted_at (GDPR Story 16.5). */
	softDelete(id: string, deletedAt: Date): void {
		const row = store.get(id)
		if (row != null) {
			store.set(id, { ...row, deleted_at: deletedAt })
		}
	},

	/**
	 * Return customers whose deleted_at is older than 30 days (due for hard-purge).
	 * In production this maps to: WHERE deleted_at <= now() - INTERVAL '30 days'
	 */
	findDueForHardPurge(now: Date = new Date()): CustomerRow[] {
		const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
		return [...store.values()].filter(
			(r) => r.deleted_at != null && r.deleted_at <= cutoff,
		)
	},

	/**
	 * Overwrite dek_wrapped and dek_salt with random bytes of the same length.
	 * Called just before hard-purge so any DB backup taken after cannot decrypt residual ciphertext.
	 */
	scrambleDekWrapped(id: string): void {
		const row = store.get(id)
		if (row == null) return
		const newWrapped = row.dek_wrapped != null ? randomBytes(row.dek_wrapped.length) : randomBytes(32)
		const newSalt = row.dek_salt != null ? randomBytes(row.dek_salt.length) : randomBytes(32)
		store.set(id, { ...row, dek_wrapped: newWrapped, dek_salt: newSalt })
	},

	/** Hard-delete a customer row (cascades to child tables in production). */
	delete(id: string): void {
		store.delete(id)
	},

	/** Seed a customer for testing / bootstrapping. */
	_seed(row: CustomerRow): void {
		store.set(row.id, row)
	},

	/** Clear all customers — used between tests. */
	_clear(): void {
		store.clear()
	},
}
