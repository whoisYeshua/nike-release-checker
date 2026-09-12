import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { writeFile } from 'node:fs/promises'
import { loadAccountsFile } from './accountConfig.ts'

const TMP = '/tmp/test-accounts-config.json'

async function write(data: unknown): Promise<void> {
	await writeFile(TMP, JSON.stringify(data), 'utf8')
}

describe('loadAccountsFile', () => {
	it('returns valid accounts for well-formed entries', async () => {
		await write([
			{ id: 'acc-1', email: 'user@test.com', password: 'pass', proxy: 'http://u:p@proxy.host:8080', country: 'FR' },
		])
		const { valid, errors } = await loadAccountsFile(TMP)
		assert.equal(valid.length, 1)
		assert.equal(errors.length, 0)
		assert.equal(valid[0]!.id, 'acc-1')
		assert.equal(valid[0]!.paymentMethod, 'PRE_SAVED')
		assert.deepEqual(valid[0]!.preferredSizes, [])
	})

	it('applies optional field defaults', async () => {
		await write([
			{ id: 'acc-2', email: 'x@y.com', password: 'pw', proxy: 'http://h:1234', country: 'US' },
		])
		const { valid } = await loadAccountsFile(TMP)
		assert.equal(valid[0]!.paymentMethod, 'PRE_SAVED')
		assert.deepEqual(valid[0]!.preferredSizes, [])
	})

	it('returns error per invalid entry without stopping others', async () => {
		await write([
			{ id: 'bad-1', email: 'not-an-email', password: 'pw', proxy: 'http://h:1234', country: 'FR' },
			{ id: 'good-1', email: 'ok@test.com', password: 'pw', proxy: 'http://h:1234', country: 'DE' },
		])
		const { valid, errors } = await loadAccountsFile(TMP)
		assert.equal(valid.length, 1)
		assert.equal(valid[0]!.id, 'good-1')
		assert.ok(errors.length > 0)
		assert.equal(errors[0]!.index, 0)
	})

	it('errors when country code is not exactly 2 chars', async () => {
		await write([
			{ id: 'acc-x', email: 'u@d.com', password: 'pw', proxy: 'http://h:1234', country: 'FRA' },
		])
		const { valid, errors } = await loadAccountsFile(TMP)
		assert.equal(valid.length, 0)
		assert.ok(errors.some((e) => e.field === 'country'))
	})

	it('errors when proxy is not a URL', async () => {
		await write([
			{ id: 'acc-y', email: 'u@d.com', password: 'pw', proxy: 'not-a-url', country: 'FR' },
		])
		const { valid, errors } = await loadAccountsFile(TMP)
		assert.equal(valid.length, 0)
		assert.ok(errors.some((e) => e.field === 'proxy'))
	})

	it('throws on invalid JSON', async () => {
		await writeFile(TMP, '{ invalid json }', 'utf8')
		await assert.rejects(() => loadAccountsFile(TMP), /not valid JSON/)
	})

	it('throws when root is not an array', async () => {
		await write({ id: 'x' })
		await assert.rejects(() => loadAccountsFile(TMP), /Expected an array/)
	})
})
