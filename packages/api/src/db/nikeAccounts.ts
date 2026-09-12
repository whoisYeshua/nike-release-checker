/**
 * Nike accounts repository — in-memory stub (Story 16.4)
 *
 * Stores Nike account rows with per-field AES-256-GCM encryption.
 * email_lookup = HMAC-SHA256(dek, lowercase(email)) is deterministic,
 * allowing per-customer uniqueness enforcement without comparing ciphertexts.
 *
 * Tenant isolation is enforced on every read/update/delete.
 */

import { createHmac, randomUUID } from 'node:crypto'
import { getDek } from '../crypto/dekCache.ts'
import { encryptField, decryptField } from '../crypto/fieldCrypto.ts'

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

interface NikeAccountRow {
  id: string
  customer_id: string
  country: string
  email_encrypted: Buffer
  email_lookup: Buffer          // HMAC-SHA256(dek, lowercase(email)) — deterministic
  password_encrypted: Buffer
  proxy_url_encrypted: Buffer | null
  preferred_sizes: string[]
  session_snapshot_encrypted: Buffer | null
  session_status: string
  last_login_at: Date | null
  created_at: Date
}

/** Public metadata shape — no encrypted or sensitive fields. */
export interface NikeAccountMeta {
  id: string
  country: string
  email_masked: string
  session_status: string
  last_login_at: string | null
  preferred_sizes: string[]
  created_at: string
}

/** Internal plaintext shape — used exclusively by worker pool (Epic 17). */
export interface NikeAccountPlaintext {
  email: string
  password: string
  proxy_url: string | null
  country: string
  preferred_sizes: string[]
  session_snapshot: Record<string, unknown> | null
}

export interface CreateNikeAccountInput {
  email: string
  password: string
  country: string
  proxy_url?: string
  preferred_sizes?: string[]
}

export interface UpdateNikeAccountInput {
  password?: string
  proxy_url?: string | null
  preferred_sizes?: string[]
}

export interface Page<T> {
  data: T[]
  next_cursor: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hmacSha256(dek: Buffer, value: string): Buffer {
  return createHmac('sha256', dek).update(value, 'utf8').digest()
}

function maskEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx <= 0) return '***'
  const firstChar = email[0]!
  const domain = email.slice(atIdx)
  return `${firstChar}***${domain}`
}

function toMeta(row: NikeAccountRow): NikeAccountMeta {
  return {
    id: row.id,
    country: row.country,
    email_masked: '__deferred__',  // resolved in public methods that have dek access
    session_status: row.session_status,
    last_login_at: row.last_login_at ? row.last_login_at.toISOString() : null,
    preferred_sizes: row.preferred_sizes,
    created_at: row.created_at.toISOString(),
  }
}

function toMetaWithDecrypt(row: NikeAccountRow, dek: Buffer): NikeAccountMeta {
  const email = decryptField(row.email_encrypted, dek)
  return {
    id: row.id,
    country: row.country,
    email_masked: maskEmail(email),
    session_status: row.session_status,
    last_login_at: row.last_login_at ? row.last_login_at.toISOString() : null,
    preferred_sizes: row.preferred_sizes,
    created_at: row.created_at.toISOString(),
  }
}

function conflict(code: string): Error {
  const err = new Error(code) as Error & { statusCode: number; code: string }
  ;(err as unknown as { statusCode: number }).statusCode = 409
  ;(err as unknown as { code: string }).code = code
  return err
}

function notFound(): Error {
  const err = new Error('not found') as Error & { statusCode: number; code: string }
  ;(err as unknown as { statusCode: number }).statusCode = 404
  ;(err as unknown as { code: string }).code = 'not_found'
  return err
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const store = new Map<string, NikeAccountRow>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const nikeAccountsDb = {
  /**
   * Encrypt and persist a new Nike account row.
   * Throws 409 if (customer_id, email_lookup) already exists.
   */
  async create(customerId: string, input: CreateNikeAccountInput): Promise<NikeAccountMeta> {
    const dek = await getDek(customerId)
    const emailLower = input.email.trim().toLowerCase()
    const emailLookup = hmacSha256(dek, emailLower)

    // Enforce uniqueness on the deterministic lookup
    for (const row of store.values()) {
      if (row.customer_id === customerId && row.email_lookup.equals(emailLookup)) {
        throw conflict('nike_account_already_registered')
      }
    }

    const row: NikeAccountRow = {
      id: randomUUID(),
      customer_id: customerId,
      country: input.country,
      email_encrypted: encryptField(emailLower, dek),
      email_lookup: emailLookup,
      password_encrypted: encryptField(input.password, dek),
      proxy_url_encrypted: input.proxy_url ? encryptField(input.proxy_url, dek) : null,
      preferred_sizes: input.preferred_sizes ?? [],
      session_snapshot_encrypted: null,
      session_status: 'unknown',
      last_login_at: null,
      created_at: new Date(),
    }
    store.set(row.id, row)
    return toMetaWithDecrypt(row, dek)
  },

  /** Return metadata for a single account scoped to `customerId`. */
  async getMetadata(id: string, customerId: string): Promise<NikeAccountMeta | null> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) return null
    const dek = await getDek(customerId)
    return toMetaWithDecrypt(row, dek)
  },

  /** List paginated account metadata for `customerId`. */
  async listMetadata(
    customerId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Page<NikeAccountMeta>> {
    const rows = [...store.values()]
      .filter((r) => r.customer_id === customerId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())

    const cursorIdx = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0
    const page = rows.slice(cursorIdx, cursorIdx + limit)
    const next_cursor =
      page.length === limit && cursorIdx + limit < rows.length
        ? (page[page.length - 1]?.id ?? null)
        : null

    const dek = await getDek(customerId)
    return {
      data: page.map((r) => toMetaWithDecrypt(r, dek)),
      next_cursor,
    }
  },

  /**
   * Update mutable fields (password, proxy_url, preferred_sizes).
   * email is NOT mutable — clients must delete + recreate.
   * Returns false if the row is not found or not owned by `customerId`.
   */
  async update(id: string, customerId: string, input: UpdateNikeAccountInput): Promise<boolean> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) return false

    const dek = await getDek(customerId)
    const updated: NikeAccountRow = {
      ...row,
      password_encrypted:
        input.password !== undefined ? encryptField(input.password, dek) : row.password_encrypted,
      proxy_url_encrypted:
        input.proxy_url !== undefined
          ? input.proxy_url !== null
            ? encryptField(input.proxy_url, dek)
            : null
          : row.proxy_url_encrypted,
      preferred_sizes: input.preferred_sizes !== undefined ? input.preferred_sizes : row.preferred_sizes,
    }
    store.set(id, updated)
    return true
  },

  /** Hard-delete a Nike account row scoped to `customerId`. Returns false if not found. */
  async remove(id: string, customerId: string): Promise<boolean> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) return false
    store.delete(id)
    return true
  },

  /**
   * Decrypt and return all plaintext fields for a Nike account.
   *
   * INTERNAL USE ONLY — consumed by worker pool (Epic 17).
   * MUST NOT be called from any route handler.
   */
  async loadForWorker(id: string, customerId: string): Promise<NikeAccountPlaintext> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) throw notFound()
    const dek = await getDek(customerId)
    return {
      email: decryptField(row.email_encrypted, dek),
      password: decryptField(row.password_encrypted, dek),
      proxy_url: row.proxy_url_encrypted ? decryptField(row.proxy_url_encrypted, dek) : null,
      country: row.country,
      preferred_sizes: row.preferred_sizes,
      session_snapshot: row.session_snapshot_encrypted
        ? (JSON.parse(decryptField(row.session_snapshot_encrypted, dek)) as Record<string, unknown>)
        : null,
    }
  },

  /**
   * Re-encrypt and persist the session snapshot after a successful drop run.
   * Throws if the row is not found or not owned by `customerId`.
   */
  async persistSessionSnapshot(
    id: string,
    customerId: string,
    snapshot: Record<string, unknown>,
  ): Promise<void> {
    const row = store.get(id)
    if (!row || row.customer_id !== customerId) throw notFound()
    const dek = await getDek(customerId)
    const blob = encryptField(JSON.stringify(snapshot), dek)
    store.set(id, {
      ...row,
      session_snapshot_encrypted: blob,
      session_status: 'active',
      last_login_at: new Date(),
    })
  },

  /** Hard-delete all Nike account rows for a customer (GDPR purge — Story 16.5). */
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

  /** Clear all Nike accounts — called between tests. */
  _clear(): void {
    store.clear()
  },

  /** Expose raw encrypted row for crypto-level tests. */
  _getRaw(id: string): NikeAccountRow | undefined {
    return store.get(id)
  },

  /** Expose toMeta for test inspection. */
  _toMeta: toMeta,
}
