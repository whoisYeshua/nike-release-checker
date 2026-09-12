import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { execSync } from 'node:child_process'

const CLI = 'node --experimental-strip-types src/cli/index.ts'

describe('CLI entry point', () => {
	it('--help displays all 7 commands', () => {
		const output = execSync(`${CLI} --help`, { encoding: 'utf8' })
		for (const cmd of ['import-accounts', 'login-all', 'logout-all', 'accounts', 'start', 'dry-run', 'status']) {
			assert.ok(output.includes(cmd), `Missing command: ${cmd}`)
		}
	})

	it('--version displays 0.1.0', () => {
		const output = execSync(`${CLI} --version`, { encoding: 'utf8' })
		assert.ok(output.includes('0.1.0'), `Expected 0.1.0 in: ${output}`)
	})

	it('unknown command exits with non-zero code', () => {
		assert.throws(
			() => execSync(`${CLI} unknown-command`, { encoding: 'utf8', stdio: 'pipe' }),
			'Expected error on unknown command',
		)
	})

	it('dry-run without --slug exits with error', () => {
		assert.throws(
			() => execSync(`${CLI} dry-run --profile acc1`, { encoding: 'utf8', stdio: 'pipe' }),
			'Expected error when --slug is missing for dry-run',
		)
	})

	it('dry-run without --profile exits with error', () => {
		assert.throws(
			() => execSync(`${CLI} dry-run --slug cv1723-103`, { encoding: 'utf8', stdio: 'pipe' }),
			'Expected error when --profile is missing for dry-run',
		)
	})

	it('start without --slug exits with error', () => {
		assert.throws(
			() => execSync(`${CLI} start --sizes 42`, { encoding: 'utf8', stdio: 'pipe' }),
			'Expected error when --slug is missing for start',
		)
	})

	it('import-accounts without --file exits with error', () => {
		assert.throws(
			() => execSync(`${CLI} import-accounts`, { encoding: 'utf8', stdio: 'pipe' }),
			'Expected error when --file is missing for import-accounts',
		)
	})
})
