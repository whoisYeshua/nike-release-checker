/**
 * Cards repository — in-memory stub (Story 16.3)
 *
 * Stores payment card rows with per-field AES-256-GCM encryption.
 * Real Postgres implementation uses the `cards` table from migration 0002.
 *
 * Tenant isolation is enforced on every read/delete: all queries are scoped to
 * `customerId`, so no cross-customer data leakage is possible at the DB layer.
 */

import { randomUUID } from 'node:crypto'
import { getDek } from '../crypto/dekCache.ts'
import { encryptField, decryptField } from '../crypto/fieldCrypto.ts'
import { isLuhnValid, inferBrand, last4, maskHolder } from '../services/cards/panUtils.ts'

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** The shape stored (and kept in-memory). */
interface CardRow {
  id: string
  customer_id: string
  holder_name_encrypted: Buffer
  card_number_encrypted: Buffer
  expiry_encrypted: Buffer
  cvv_encrypted: Buffer
  brand: string
  last4: string
  created_at: Date
}

/** Public metadata shape — no encrypted fields, no PAN/CVV. */
export interface CardMeta {
  id: string
  brand: string
  last4: string
  holder_name_masked: string
  expiry_month: string
  expiry_year_yy: string
  created_at: string
}

/** Internal plaintext shape — used exclusively by worker pool (Epic 17). */
export interface CardPlaintext {
  holder_name: string
  card_number: string
  expiry: string
  cvv: string
}

export interface CreateCardInput {
  holder_name: string
  card_number: string
  expiry: string
  cvv: string
  brand?: string
  last4?: string
}

export interface Page<T> {
  data: T[]
  next_cursor: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function badRequest(code: string): Error {
  const err = new Error(code) as Error & { statusCode: number; code: string }
  ;(err as unknown as { statusCode: number }).statusCode = 400
  ;(err as unknown as { code: string }).code = code
  return err
}

/**
 * Parse an expiry string ("MM/YY" or "MMYY") into { month, year }.
 * Returns empty strings if unparseable (graceful degradation for worker use).
 */
function parseExpiry(expiry: string): { month: string; year: string } {
  const clean = expiry.replace(/\s/g, '')
  const match = /^(\d{2})[\/\-]?(\d{2})$/.exec(clean)
  if (!match) return { month: '', year: '' }
  return { month: match[1]!, year: match[2]! }
}

function toMeta(row: CardRow, dek: Buffer): CardMeta {
  const holderName = decryptField(row.holder_name_encrypted, dek)
  const expiry = decryptField(row.expiry_encrypted, dek)
  const { month, year } = parseExpiry(expiry)
  return {
    id: row.id,
    brand: row.brand,
    last4: row.last4,
    holder_name_masked: maskHolder(holderName),
    expiry_month: month,
    expiry_year_yy: year,
    created_at: row.created_at.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const store = new Map<string, CardRow>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const cardsDb = {
  /**
   * Encrypt and persist a new card row.
   * Throws HTTP 400 if Luhn validation fails.
   */
  async create(customerId: string, input: CreateCardInput): Promise<CardMeta> {
    if (!isLuhnValid(input.card_number)) throw badRequest('invalid_card_number')
    const dek = await getDek(customerId)
    const row: CardRow = {
      id: randomUUID(),
      customer_id: customerId,
      holder_name_encrypted: encryptField(input.holder_name, dek),
      card_number_encrypted: encryptField(input.card_number, dek),
      expiry_encrypted: encryptField(input.expiry, dek),
      cvv_encrypted: encryptField(input.cvv, dek),
      brand: input.brand ?? inferBrand(input.card_number),
      last4: input.last4 ?? last4(input.card_number),
      created_at: new Date(),
    }
    store.set(row.id, row)
    return toMeta(row, dek)
  },

  /** Return metadata for a single card scoped to `customerId`. */
  async getMetadata(id: string, customerId: string): Promise<CardMeta | null> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) return null
    const dek = await getDek(customerId)
    return toMeta(row, dek)
  },

  /** List paginated card metadata for `customerId`. */
  async listMetadata(
    customerId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Page<CardMeta>> {
    const rows = [...store.values()]
      .filter((r) => r.customer_id === customerId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())

    // Simple cursor: the last id seen
    const cursorIdx = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0
    const page = rows.slice(cursorIdx, cursorIdx + limit)
    const next_cursor = page.length === limit && cursorIdx + limit < rows.length
      ? (page[page.length - 1]?.id ?? null)
      : null

    const dek = await getDek(customerId)
    return {
      data: page.map((r) => toMeta(r, dek)),
      next_cursor,
    }
  },

  /** Hard-delete a card row scoped to `customerId`. Returns false if not found. */
  async remove(id: string, customerId: string): Promise<boolean> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) return false
    store.delete(id)
    return true
  },

  /**
   * Decrypt and return all plaintext fields for a card.
   *
   * INTERNAL USE ONLY — consumed by worker pool (Epic 17).
   * MUST NOT be called from any route handler.
   */
  async getPlaintextForWorker(id: string, customerId: string): Promise<CardPlaintext> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) throw new Error('card not found')
    const dek = await getDek(customerId)
    return {
      holder_name: decryptField(row.holder_name_encrypted, dek),
      card_number: decryptField(row.card_number_encrypted, dek),
      expiry: decryptField(row.expiry_encrypted, dek),
      cvv: decryptField(row.cvv_encrypted, dek),
    }
  },

  /** Hard-delete all card rows belonging to a customer (GDPR purge — Story 16.5). */
  deleteByCustomer(customerId: string): void {
    for (const [id, row] of store.entries()) {
      if (row.customer_id === customerId) {
        store.delete(id)
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Test helpers
  // ---------------------------------------------------------------------------

  /** Seed a pre-built row directly (testing only). */
  _seedRow(row: CardRow): void {
    store.set(row.id, row)
  },

  /** Clear all cards — called between tests. */
  _clear(): void {
    store.clear()
  },

  /** Expose raw encrypted row for crypto-level tests. */
  _getRaw(id: string): CardRow | undefined {
    return store.get(id)
  },
}
