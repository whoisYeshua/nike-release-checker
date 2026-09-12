import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDropCsv, resolveAccountsFilter } from './dropCsv.ts'

async function withTempCsv(content: string, fn: (path: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), 'nike-bot-test-'))
	const file = join(dir, 'drop.csv')
	await writeFile(file, content, 'utf8')
	try {
		await fn(file)
	} finally {
		await rm(dir, { recursive: true })
	}
}

// ---------------------------------------------------------------------------
// Existing tests — updated field name accounts_filter → accountsFilter
// ---------------------------------------------------------------------------

test("accounts_filter='all' parsed as kind:'all'", async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nAH7389-106,42;42.5,all',
		async (f) => {
			const r = await parseDropCsv(f, new Set(['kev_001']))
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 1)
			assert.deepEqual(r.drops[0]!.accountsFilter, { kind: 'all' })
		},
	)
})

test('explicit filter with known ids parsed as kind:explicit', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nAH7389-106,42;42.5,kev_001;kev_002',
		async (f) => {
			const r = await parseDropCsv(f, new Set(['kev_001', 'kev_002']))
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 1)
			assert.deepEqual(r.drops[0]!.accountsFilter, {
				kind: 'explicit',
				ids: ['kev_001', 'kev_002'],
			})
		},
	)
})

test('unknown id in explicit filter → error, drop excluded', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nAH7389-106,42,kev_001;ghost_999',
		async (f) => {
			const r = await parseDropCsv(f, new Set(['kev_001']))
			assert.equal(r.drops.length, 0)
			assert.equal(r.errors.length, 1)
			assert.equal(r.errors[0]!.column, 'accounts_filter')
			assert.match(r.errors[0]!.message, /unknown account_ids.*ghost_999/)
		},
	)
})

test('duplicate SKU → warning but both kept', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\n' +
			'AH7389-106,42,all\n' +
			'AH7389-106,43,all',
		async (f) => {
			const r = await parseDropCsv(f, new Set())
			assert.equal(r.drops.length, 2)
			assert.equal(r.errors.length, 0)
			assert.equal(r.warnings.length, 1)
			assert.match(r.warnings[0]!.message, /duplicate SKU/)
		},
	)
})

test('empty filter string defaults to all', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nAH7389-106,42,',
		async (f) => {
			const r = await parseDropCsv(f, new Set())
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 1)
			assert.deepEqual(r.drops[0]!.accountsFilter, { kind: 'all' })
		},
	)
})

test("resolveAccountsFilter with kind:'all' returns only validSessionIds", () => {
	const filter = { kind: 'all' as const }
	const all = ['kev_001', 'kev_002', 'kev_003']
	const valid = new Set(['kev_001', 'kev_003'])
	assert.deepEqual(resolveAccountsFilter(filter, all, valid), ['kev_001', 'kev_003'])
})

test('resolveAccountsFilter with explicit kind filters by validSessionIds', () => {
	const filter = {
		kind: 'explicit' as const,
		ids: ['kev_001', 'kev_002', 'kev_003'],
	}
	const all = ['kev_001', 'kev_002', 'kev_003', 'kev_004']
	const valid = new Set(['kev_001', 'kev_003'])
	assert.deepEqual(resolveAccountsFilter(filter, all, valid), ['kev_001', 'kev_003'])
})

test('non-standard SKU warns but keeps row', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nWEIRDSKU!,42,all',
		async (f) => {
			const r = await parseDropCsv(f, new Set())
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 1)
			assert.equal(r.warnings.length, 1)
			assert.match(r.warnings[0]!.message, /non-standard SKU/)
		},
	)
})

test('missing sizes → error, drop excluded', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nAH7389-106,,all',
		async (f) => {
			const r = await parseDropCsv(f, new Set())
			assert.equal(r.drops.length, 0)
			assert.equal(r.errors.length, 1)
			assert.equal(r.errors[0]!.column, 'sizes')
		},
	)
})

// ---------------------------------------------------------------------------
// Story 13.5 — multi-country tests
// ---------------------------------------------------------------------------

// Test 1: row without `country` column → resolves to defaultCountry (FR)
test('row without country column → defaults to defaultCountry (FR)', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nAH7389-106,42,all',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 1)
			assert.equal(r.drops[0]!.country, 'FR')
		},
	)
})

// Test 2: row with country=FR → resolves to FR
test('row with explicit country=FR resolves to FR', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter,country\nAH7389-106,42,all,FR',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 1)
			assert.equal(r.drops[0]!.country, 'FR')
		},
	)
})

// Test 3: row with country=fr (lowercase) → normalizes to FR
test('lowercase country code normalized to uppercase', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter,country\nAH7389-106,42,all,fr',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 1)
			assert.equal(r.drops[0]!.country, 'FR')
		},
	)
})

// Test 4: row with country=UK → normalizes to GB (GB is disabled in v3.0, but the alias
// normalization must have occurred — the error message references GB, not UK)
test('UK alias normalized to GB — error references GB not UK', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter,country\nAH7389-106,42,all,UK',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			// GB is disabled in v3.0, so normalization succeeded (UK→GB) but the
			// drop is rejected. The error must mention GB (proving alias was applied).
			assert.equal(r.drops.length, 0)
			assert.equal(r.errors.length, 1)
			assert.equal(r.errors[0]!.column, 'country')
			assert.match(r.errors[0]!.message, /GB/) // normalization happened
			assert.match(r.errors[0]!.message, /disabled/) // disabled, not unknown
		},
	)
})

// Test 5: row with country=XX (unknown) → error with row number + message
test('unknown country code → error with row number', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter,country\nAH7389-106,42,all,XX',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			assert.equal(r.drops.length, 0)
			assert.equal(r.errors.length, 1)
			assert.equal(r.errors[0]!.column, 'country')
			assert.match(r.errors[0]!.message, /unknown country code/)
			assert.match(r.errors[0]!.message, /XX/)
		},
	)
})

// Test 6: row with country=US (v3.0 disabled) → error mentioning disabled state
test('disabled country code → error mentioning disabled', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter,country\nAH7389-106,42,all,US',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			assert.equal(r.drops.length, 0)
			assert.equal(r.errors.length, 1)
			assert.equal(r.errors[0]!.column, 'country')
			assert.match(r.errors[0]!.message, /disabled/)
			assert.match(r.errors[0]!.message, /US/)
		},
	)
})

// Test 7: backward compat — old CSV without country column at all → all rows inherit default
test('backward compat: CSV without country column → all rows inherit defaultCountry', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter\nAH7389-106,42,all\nDD1391-100,43,all',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			assert.equal(r.errors.length, 0)
			assert.equal(r.drops.length, 2)
			assert.equal(r.drops[0]!.country, 'FR')
			assert.equal(r.drops[1]!.country, 'FR')
		},
	)
})

// Test 8: mixed-country CSV — in v3.0 only FR is enabled; a CSV with FR + an
// unsupported country produces 1 valid drop + 1 error (each row independently processed)
test('mixed-country CSV: valid FR row kept, disabled-country row produces error', async () => {
	await withTempCsv(
		'sku,sizes,accounts_filter,country\nAH7389-106,42,all,FR\nDD1391-100,43,all,US',
		async (f) => {
			const r = await parseDropCsv(f, new Set(), 'FR')
			assert.equal(r.drops.length, 1)
			assert.equal(r.drops[0]!.country, 'FR')
			assert.equal(r.errors.length, 1)
			assert.match(r.errors[0]!.message, /US/)
			assert.match(r.errors[0]!.message, /disabled/)
		},
	)
})

// Test 9: accounts_filter=all scoped per country
test('resolveAccountsFilter kind:all with dropCountry scopes to matching accounts', () => {
	const filter = { kind: 'all' as const }
	const allIds = ['kev_fr', 'kev_gb', 'kev_fr2']
	const valid = new Set(['kev_fr', 'kev_gb', 'kev_fr2'])
	const accountCountries = new Map([
		['kev_fr', 'FR'],
		['kev_gb', 'GB'],
		['kev_fr2', 'FR'],
	])
	const result = resolveAccountsFilter(filter, allIds, valid, 'FR', accountCountries)
	assert.deepEqual(result, ['kev_fr', 'kev_fr2'])
})
