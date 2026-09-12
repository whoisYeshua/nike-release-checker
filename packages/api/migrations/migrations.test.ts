/**
 * Story 16.1 — Migration integration tests
 *
 * Uses pg-mem for in-process Postgres emulation so CI needs no Docker.
 * Covers:
 *  - Idempotency: running migrate twice is a no-op.
 *  - Cascade delete: deleting a customer removes all child rows.
 *  - Cross-tenant isolation: customer A rows not visible via customer B query.
 *  - CHECK constraint: invalid drop state is rejected.
 *  - audit_log: customer_id nullable for system events.
 */

import assert from 'node:assert/strict'
import { describe, it, before } from 'node:test'
import { newDb, DataType } from 'pg-mem'
import { runUp } from './runner.ts'
import type pg from 'pg'

/**
 * Create a pg-mem client with no-op pgcrypto + citext extensions registered.
 * pg-mem supports gen_random_uuid() natively; we only need the extension
 * declaration to not throw.
 */
function makePgMemClient(): { client: pg.Client; end: () => Promise<void> } {
  const db = newDb()

  // Register no-op extension stubs so CREATE EXTENSION IF NOT EXISTS does not throw
  db.registerExtension('pgcrypto', () => { /* no-op */ })
  db.registerExtension('citext', () => { /* no-op */ })

  // pg-mem doesn't implement gen_random_uuid() by default — register it
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.text,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      }),
    impure: true,
  })

  const adapters = db.adapters.createPg()
  const client = new adapters.Client() as unknown as pg.Client
  return {
    client,
    end: async () => { /* pg-mem client.end() is synchronous no-op */ },
  }
}

async function freshMigratedClient(): Promise<pg.Client> {
  const { client } = makePgMemClient()
  // pg-mem connect is async no-op but must be called
  await (client as unknown as { connect(): Promise<void> }).connect()
  await runUp(client)
  return client
}

describe('Migration 16.1 — schema tests', () => {
  let client: pg.Client

  before(async () => {
    client = await freshMigratedClient()
  })

  it('schema_migrations tracks all migration files after runUp', async () => {
    const res = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    )
    // All migrations are tracked (including pg-mem-skip ones which are inserted but not executed)
    assert.ok(res.rows.length >= 6, `Expected at least 6 migrations, got ${res.rows.length}`)
    assert.equal(res.rows[0]!.version, '0001_customers_and_api_keys.sql')
  })

  it('runUp is idempotent — second call is a no-op (no error, same row count)', async () => {
    const before = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    )
    await runUp(client)
    const after = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    )
    assert.equal(after.rows.length, before.rows.length)
  })

  it('CASCADE: deleting a customer removes api_keys, drops, webhooks', async () => {
    // Insert customer
    const custRes = await client.query<{ id: string }>(
      `INSERT INTO customers(email, dek_wrapped, dek_salt) VALUES('cascade-test@example.com', '\\x', '\\x') RETURNING id`,
    )
    const customerId = custRes.rows[0]!.id

    // Insert api_key
    await client.query(
      `INSERT INTO api_keys(key_id, customer_id, secret_hash) VALUES('k1', $1, 'hash')`,
      [customerId],
    )

    // Insert webhook
    await client.query(
      `INSERT INTO webhooks(customer_id, url, secret_encrypted) VALUES($1, 'https://ex.com', '\\x')`,
      [customerId],
    )

    // Insert drop
    await client.query(
      `INSERT INTO drops(customer_id, country, sku, sizes_json, max_accounts) VALUES($1, 'US', 'ABC-123', '["10"]', 1)`,
      [customerId],
    )

    // Verify rows exist before deletion
    const beforeApi = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM api_keys WHERE customer_id=$1`,
      [customerId],
    )
    const beforeWh = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM webhooks WHERE customer_id=$1`,
      [customerId],
    )
    const beforeDr = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM drops WHERE customer_id=$1`,
      [customerId],
    )
    assert.equal(beforeApi.rows[0]!.c, '1')
    assert.equal(beforeWh.rows[0]!.c, '1')
    assert.equal(beforeDr.rows[0]!.c, '1')

    // Delete customer — cascades to all child tables
    await client.query('DELETE FROM customers WHERE id=$1', [customerId])

    const afterApi = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM api_keys WHERE customer_id=$1`,
      [customerId],
    )
    const afterWh = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM webhooks WHERE customer_id=$1`,
      [customerId],
    )
    const afterDr = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM drops WHERE customer_id=$1`,
      [customerId],
    )
    assert.equal(afterApi.rows[0]!.c, '0')
    assert.equal(afterWh.rows[0]!.c, '0')
    assert.equal(afterDr.rows[0]!.c, '0')
  })

  it('Cross-tenant isolation: customer B rows NOT visible to customer A query', async () => {
    const rA = await client.query<{ id: string }>(
      `INSERT INTO customers(email, dek_wrapped, dek_salt) VALUES('tenant-a@example.com', '\\x', '\\x') RETURNING id`,
    )
    const rB = await client.query<{ id: string }>(
      `INSERT INTO customers(email, dek_wrapped, dek_salt) VALUES('tenant-b@example.com', '\\x', '\\x') RETURNING id`,
    )
    const idA = rA.rows[0]!.id
    const idB = rB.rows[0]!.id

    // Insert a drop for customer B
    await client.query(
      `INSERT INTO drops(customer_id, country, sku, sizes_json, max_accounts) VALUES($1, 'US', 'SKU-B', '["9"]', 1)`,
      [idB],
    )

    // Customer A query must return 0 rows
    const res = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM drops WHERE customer_id = $1',
      [idA],
    )
    assert.equal(res.rows[0]!.count, '0')
  })

  it('CHECK constraint: drop with invalid state is rejected', async () => {
    const custRes = await client.query<{ id: string }>(
      `INSERT INTO customers(email, dek_wrapped, dek_salt) VALUES('constraint-test@example.com', '\\x', '\\x') RETURNING id`,
    )
    const customerId = custRes.rows[0]!.id

    await assert.rejects(
      () =>
        client.query(
          `INSERT INTO drops(customer_id, country, sku, sizes_json, max_accounts, state)
           VALUES($1, 'US', 'SKU-X', '["10"]', 1, 'WEIRD')`,
          [customerId],
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        return true
      },
    )
  })

  it('audit_log: customer_id is nullable for system events', async () => {
    await client.query(
      `INSERT INTO audit_log(customer_id, actor, action, resource_type)
       VALUES(NULL, 'system', 'system.startup', 'system')`,
    )
    const res = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_log WHERE customer_id IS NULL`,
    )
    assert.ok(parseInt(res.rows[0]!.count, 10) >= 1)
  })
})
