import { describe, it, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadBotConfig } from './index.ts'

const tmpConfig = join(tmpdir(), `test-bot-config-${Date.now()}.yaml`)

describe('loadBotConfig', () => {
	after(async () => {
		await rm(tmpConfig, { force: true })
	})

	it('returns default values when config file does not exist', async () => {
		// Run from a tmp dir so we test the default-path-missing branch
		// regardless of any bot.config.yaml that may exist in the test cwd.
		const originalCwd = process.cwd()
		const tmpDir = await import('node:fs/promises').then((fs) =>
			fs.mkdtemp('/tmp/loadBotConfig-default-'),
		)
		process.chdir(tmpDir)
		try {
			const config = await loadBotConfig()
			assert.equal(config.polling.interval, 5000)
			assert.equal(config.polling.timeout, 30000)
			assert.equal(config.checkout.market, 'FR')
			assert.equal(config.checkout.language, 'fr')
			assert.equal(config.checkout.currency, 'EUR')
			assert.deepEqual(config.checkout.defaultSizes, [])
			assert.equal(config.proxy.rotationMode, 'per-account')
			assert.equal(config.proxy.testOnImport, true)
			assert.equal(config.stealth.headless, true)
			assert.equal(config.stealth.userAgent, 'auto')
			assert.equal(config.daemon.logFile, './logs/bot.log')
			assert.equal(config.daemon.pidFile, './bot.pid')
			return
		} finally {
			process.chdir(originalCwd)
			await import('node:fs/promises').then((fs) =>
				fs.rm(tmpDir, { recursive: true, force: true }),
			)
		}
	})

	it('loads and parses a valid full YAML config file', async () => {
		await writeFile(
			tmpConfig,
			`
polling:
  interval: 10000
  timeout: 60000
checkout:
  market: "DE"
  language: "de"
  currency: "EUR"
  defaultSizes: ["41", "42"]
proxy:
  rotationMode: "per-account"
  testOnImport: false
stealth:
  headless: false
  userAgent: "Mozilla/5.0"
daemon:
  logFile: "/tmp/bot.log"
  pidFile: "/tmp/bot.pid"
`,
		)
		const config = await loadBotConfig(tmpConfig)
		assert.equal(config.polling.interval, 10000)
		assert.equal(config.polling.timeout, 60000)
		assert.equal(config.checkout.market, 'DE')
		assert.equal(config.checkout.language, 'de')
		assert.deepEqual(config.checkout.defaultSizes, ['41', '42'])
		assert.equal(config.proxy.testOnImport, false)
		assert.equal(config.stealth.headless, false)
		assert.equal(config.stealth.userAgent, 'Mozilla/5.0')
		assert.equal(config.daemon.logFile, '/tmp/bot.log')
	})

	it('throws a validation error when polling.interval is below minimum (1000)', async () => {
		await writeFile(tmpConfig, 'polling:\n  interval: 500\n')
		await assert.rejects(
			() => loadBotConfig(tmpConfig),
			(err: Error) => err.message.includes('Invalid configuration') && err.message.includes('polling'),
		)
	})

	it('throws a validation error when checkout.market is not a string', async () => {
		await writeFile(tmpConfig, 'checkout:\n  market: 42\n')
		await assert.rejects(
			() => loadBotConfig(tmpConfig),
			(err: Error) => err.message.includes('Invalid configuration'),
		)
	})

	it('applies defaults for all missing fields when only partial config is provided', async () => {
		await writeFile(tmpConfig, 'checkout:\n  market: "ES"\n')
		const config = await loadBotConfig(tmpConfig)
		assert.equal(config.checkout.market, 'ES')
		assert.equal(config.checkout.language, 'fr')
		assert.equal(config.polling.interval, 5000)
		assert.equal(config.stealth.headless, true)
		assert.equal(config.daemon.logFile, './logs/bot.log')
	})

	it('throws with the file path in error when explicit path is not found', async () => {
		const missingPath = '/nonexistent/path/bot.yaml'
		await assert.rejects(
			() => loadBotConfig(missingPath),
			(err: Error) =>
				err.message.includes('Configuration file not found') && err.message.includes(missingPath),
		)
	})
})
