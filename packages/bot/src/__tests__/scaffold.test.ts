import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BOT_ROOT = new URL('../../', import.meta.url).pathname

describe('Bot package scaffold', () => {
	const requiredDirs = [
		'src/cli',
		'src/config',
		'src/auth',
		'src/stealth',
		'src/checkout',
		'src/monitor',
		'src/logger',
		'src/daemon',
	]

	for (const dir of requiredDirs) {
		it(`directory ${dir} exists`, () => {
			assert.ok(existsSync(join(BOT_ROOT, dir)), `Missing directory: ${dir}`)
		})
	}

	it('package.json has correct name and type', async () => {
		const { default: pkg } = await import(join(BOT_ROOT, 'package.json'), { with: { type: 'json' } })
		assert.equal(pkg.name, '@nike-release-checker/bot')
		assert.equal(pkg.type, 'module')
		assert.equal(pkg.engines.node, '>=24.0.0')
	})

	it('bin entry points to cli/index.ts', async () => {
		const { default: pkg } = await import(join(BOT_ROOT, 'package.json'), { with: { type: 'json' } })
		assert.ok(pkg.bin['nike-bot'].includes('cli/index.ts'))
	})
})
