/**
 * DEK in-process LRU cache — Story 16.2
 *
 * Performance contract:
 *   - max 1 000 entries; LRU eviction when full
 *   - TTL 5 min; entries expire silently
 *   - On eviction/expiry: `dispose()` zeroes the Buffer (best-effort)
 *   - Cache is per-process memory only; no persistence, no cross-process sharing
 *
 * Security contract:
 *   - Callers MUST NOT mutate the returned Buffer
 *   - `invalidateDek(customerId)` zeroes + removes the entry immediately
 *     (called by Story 16.5 DEK rotation)
 */

import { LRUCache } from 'lru-cache'
import { customersDb } from '../db/customers.ts'
import { deriveDek } from './dek.ts'

const cache = new LRUCache<string, Buffer>({
  max: 1_000,
  ttl: 5 * 60 * 1_000,
  dispose(buf: Buffer) {
    buf.fill(0)
  },
})

/**
 * Return the derived DEK for `customerId`.
 *
 * The result may come from the LRU cache (TTL 5 min).
 * Do NOT mutate the returned Buffer; do NOT cache it yourself — it will be
 * zeroed when the LRU evicts or when `invalidateDek` is called.
 */
export async function getDek(customerId: string): Promise<Buffer> {
  const hit = cache.get(customerId)
  if (hit) return hit

  const row = customersDb.findById(customerId)
  if (!row) throw new Error(`getDek: unknown customer ${customerId}`)
  if (!row.dek_wrapped || !row.dek_salt) {
    throw new Error(`getDek: customer ${customerId} has no DEK provisioned`)
  }

  const dek = await deriveDek(row.dek_wrapped, row.dek_salt, customerId)
  cache.set(customerId, dek)
  return dek
}

/**
 * Evict the cached DEK for `customerId` and zero the buffer.
 * The next call to `getDek` will re-derive from KMS.
 *
 * Called by Story 16.5 (DEK rotation) after writing a new `dek_wrapped`.
 */
export function invalidateDek(customerId: string): void {
  cache.delete(customerId) // triggers dispose() → buf.fill(0)
}
