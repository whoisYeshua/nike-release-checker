import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateTemplates, type TemplateKey } from './csvTemplates.ts'
import { parseAccountsCsv } from '../../config/accountsCsv.ts'

async function withTempDir(fn: (dir: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), 'nike-bot-templates-'))
	try {
		await fn(dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

const ALL_KEYS: TemplateKey[] = ['accounts', 'cards', 'addresses', 'drop']

test('fresh folder — all 4 templates created with header line', async () => {
	await withTempDir(async (dir) => {
		const { created, skipped } = await generateTemplates(dir)
		assert.deepEqual(created.sort(), [...ALL_KEYS].sort())
		assert.deepEqual(skipped, [])

		const accounts = await readFile(join(dir, 'accounts.csv'), 'utf8')
		assert.match(accounts, /^account_id,email,password,proxy_url,country,preferred_sizes$/m)

		const cards = await readFile(join(dir, 'cards.csv'), 'utf8')
		assert.match(cards, /^account_id,card_number,expiry,cvv,holder_name$/m)

		const addresses = await readFile(join(dir, 'addresses.csv'), 'utf8')
		assert.match(addresses, /^account_id,firstName,lastName,email,street,city,zip,country,phone$/m)

		const drop = await readFile(join(dir, 'drop.csv'), 'utf8')
		assert.match(drop, /^sku,name,sizes,accounts_filter,country$/m)
	})
})

test('re-generate without overwrite — created=0, skipped=4', async () => {
	await withTempDir(async (dir) => {
		await generateTemplates(dir)
		const { created, skipped } = await generateTemplates(dir)
		assert.equal(created.length, 0)
		assert.deepEqual(skipped.sort(), [...ALL_KEYS].sort())
	})
})

test('re-generate with overwrite:true — created=4', async () => {
	await withTempDir(async (dir) => {
		await generateTemplates(dir)
		const { created, skipped } = await generateTemplates(dir, { overwrite: true })
		assert.deepEqual(created.sort(), [...ALL_KEYS].sort())
		assert.equal(skipped.length, 0)
	})
})

test('credential files chmod 0o600; non-credential files use default umask', async () => {
	await withTempDir(async (dir) => {
		await generateTemplates(dir)

		const accountsMode = (await stat(join(dir, 'accounts.csv'))).mode & 0o777
		const cardsMode = (await stat(join(dir, 'cards.csv'))).mode & 0o777
		assert.equal(accountsMode, 0o600, 'accounts.csv should be 0o600')
		assert.equal(cardsMode, 0o600, 'cards.csv should be 0o600')

		const addressesMode = (await stat(join(dir, 'addresses.csv'))).mode & 0o777
		const dropMode = (await stat(join(dir, 'drop.csv'))).mode & 0o777
		assert.notEqual(addressesMode, 0o600, 'addresses.csv should not be 0o600')
		assert.notEqual(dropMode, 0o600, 'drop.csv should not be 0o600')
	})
})

test('generated accounts.csv parses to 0 rows + 0 errors (example rows are commented)', async () => {
	await withTempDir(async (dir) => {
		await generateTemplates(dir)
		const result = await parseAccountsCsv(join(dir, 'accounts.csv'))
		assert.equal(result.accounts.length, 0)
		assert.equal(result.errors.length, 0)
	})
})
