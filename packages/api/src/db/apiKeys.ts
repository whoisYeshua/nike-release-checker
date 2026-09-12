/**
 * In-memory stub for the api_keys repository.
 * Story 16.x will replace this with a real Postgres implementation.
 */

export interface ApiKeyRow {
	key_id: string
	customer_id: string
	secret_hash: string
	label?: string
	created_at: Date
	last_used_at?: Date
	revoked_at?: Date
}

const store = new Map<string, ApiKeyRow>()

export const apiKeysDb = {
	/**
	 * Look up an API key row by its key_id.
	 * Returns undefined if not found.
	 */
	findByKeyId(keyId: string): ApiKeyRow | undefined {
		return store.get(keyId)
	},

	/**
	 * Update last_used_at to now (fire-and-forget acceptable).
	 */
	touchLastUsed(keyId: string): void {
		const row = store.get(keyId)
		if (row != null) {
			row.last_used_at = new Date()
		}
	},

	/**
	 * Seed a key for testing / bootstrapping.
	 * Not exposed in the public API surface — tests import this directly.
	 */
	_seed(row: ApiKeyRow): void {
		store.set(row.key_id, row)
	},

	/**
	 * List all non-secret metadata for a given customer's API keys.
	 * NEVER returns secret_hash or the original secret.
	 */
	listByCustomer(customerId: string): ApiKeyMetaRow[] {
		return Array.from(store.values())
			.filter((r) => r.customer_id === customerId)
			.map((r) => ({
				key_id: r.key_id,
				label: r.label ?? null,
				created_at: r.created_at,
				last_used_at: r.last_used_at ?? null,
				revoked_at: r.revoked_at ?? null,
			}))
	},

	/** Revoke all active API keys for a customer (GDPR soft-delete — Story 16.5). */
	revokeAllForCustomer(customerId: string, revokedAt: Date = new Date()): void {
		for (const row of store.values()) {
			if (row.customer_id === customerId && row.revoked_at == null) {
				store.set(row.key_id, { ...row, revoked_at: revokedAt })
			}
		}
	},

	/** Clear all keys — used between tests. */
	_clear(): void {
		store.clear()
	},
}

export interface ApiKeyMetaRow {
	key_id: string
	label: string | null
	created_at: Date
	last_used_at: Date | null
	revoked_at: Date | null
}
