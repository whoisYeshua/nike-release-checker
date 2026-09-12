/**
 * Minimal idempotent migration runner for Story 16.1.
 *
 * Applies SQL migration files in lexicographic order using a `schema_migrations`
 * tracking table. Re-running on an already-migrated DB is a no-op.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node --import tsx migrations/runner.ts up
 *   DATABASE_URL=postgres://... node --import tsx migrations/runner.ts down 1
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

async function getClient(): Promise<pg.Client> {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is required')
  const client = new Client({ connectionString: url })
  await client.connect()
  return client
}

async function ensureTrackingTable(client: pg.Client): Promise<void> {
  // Check if table already exists before creating — avoids pg-mem quirk with CREATE TABLE IF NOT EXISTS
  const exists = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'schema_migrations'
     ) AS exists`,
  )
  if (exists.rows[0]?.exists) return
  await client.query(
    `CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)`,
  )
}

async function appliedVersions(client: pg.Client): Promise<Set<string>> {
  const res = await client.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')
  return new Set(res.rows.map((r) => r.version))
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR)
  return entries
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
}

/**
 * Split a SQL file into individual statements.
 * Handles single-line (--) comments by stripping them first, then splits on semicolons.
 * Dollar-quoting ($$ ... $$) is not used in these migrations so simple split is safe.
 */
function splitStatements(sql: string): string[] {
  // Remove single-line comments
  const stripped = sql.replace(/--[^\n]*/g, '')
  return stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export async function runUp(client: pg.Client): Promise<void> {
  await ensureTrackingTable(client)
  const applied = await appliedVersions(client)
  const files = await listMigrationFiles()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')

    // Skip migrations tagged @pg-mem-skip when the client does not expose pg-native query details.
    // pg-mem clients have no processID; real pg clients do.
    // We detect pg-mem by checking for the absence of standard pg client internals.
    if (sql.includes('@pg-mem-skip')) {
      // Real pg clients set processID after connect; pg-mem clients leave it undefined.
      // This avoids pulling pg-mem as a runtime dependency in the production runner.
      const clientAny = client as Record<string, unknown>
      const isPgMem = clientAny['processID'] === undefined
      if (isPgMem) {
        console.log(`[migrate] skipping ${file} (pg-mem-skip)`)
        // Mark as applied so idempotency checks still pass
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file])
        continue
      }
    }

    const statements = splitStatements(sql)
    await client.query('BEGIN')
    try {
      for (const stmt of statements) {
        await client.query(stmt)
      }
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file])
      await client.query('COMMIT')
      console.log(`[migrate] applied ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  }
}

export async function runDown(client: pg.Client, steps: number): Promise<void> {
  await ensureTrackingTable(client)
  const res = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT $1',
    [steps],
  )
  for (const row of res.rows) {
    const downFile = row.version.replace(/\.sql$/, '.down.sql')
    const downPath = join(MIGRATIONS_DIR, downFile)
    let downSql: string
    try {
      downSql = await readFile(downPath, 'utf8')
    } catch {
      throw new Error(
        `No rollback file found at ${downPath}. Create ${downFile} to support rollback.`,
      )
    }
    await client.query('BEGIN')
    try {
      await client.query(downSql)
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [row.version])
      await client.query('COMMIT')
      console.log(`[migrate] rolled back ${row.version}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  }
}

// CLI entrypoint — only runs when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? 'up'
  const steps = parseInt(process.argv[3] ?? '1', 10)
  const client = await getClient()
  try {
    if (command === 'up') {
      await runUp(client)
    } else if (command === 'down') {
      await runDown(client, steps)
    } else {
      console.error(`Unknown command: ${command}. Use 'up' or 'down <steps>'.`)
      process.exit(1)
    }
  } finally {
    await client.end()
  }
}
