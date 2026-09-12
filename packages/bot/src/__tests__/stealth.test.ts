import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createStealthContext } from '../stealth/contextFactory.ts'
import { maskProxy } from '../logger/credentialMasker.ts'

describe('createStealthContext', () => {
	it('creates a headless context without a proxy', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			// navigator.webdriver must NOT be true — true is the bot detection signal Nike checks.
			// Modern headless Chrome returns false (not true), stealth plugin may set undefined.
			// Either false or undefined is acceptable; only true triggers Akamai blocks.
			const webdriver = await page.evaluate(() => navigator.webdriver)
			assert.ok(webdriver !== true, `navigator.webdriver must not be true (bot signal), got: ${webdriver}`)
			await page.close()
		} finally {
			await context.close()
		}
	})

	it('locale is fr-FR', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			const locale = await page.evaluate(() => navigator.language)
			assert.equal(locale, 'fr-FR', 'locale must be fr-FR for Nike France')
			await page.close()
		} finally {
			await context.close()
		}
	})

	it('navigator.languages starts with fr-FR', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			const langs = await page.evaluate(() => navigator.languages)
			assert.ok(Array.isArray(langs) && langs[0] === 'fr-FR', 'first language must be fr-FR')
			await page.close()
		} finally {
			await context.close()
		}
	})

	it('navigator.plugins is non-empty (anti-bot signal)', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			const pluginCount = await page.evaluate(() => navigator.plugins.length)
			assert.ok(pluginCount > 0, 'plugins must not be empty — empty plugins is a bot signal')
			await page.close()
		} finally {
			await context.close()
		}
	})

	it('maskProxy masks credentials in proxy URLs', () => {
		const masked = maskProxy('http://admin:secret@proxy.example.com:8080')
		assert.ok(masked.includes('u***'), 'username must be masked')
		assert.ok(!masked.includes('secret'), 'password must NOT appear in masked URL')
		assert.ok(masked.includes('proxy.example.com'), 'hostname must remain visible')
		assert.ok(masked.includes('8080'), 'port must remain visible')
	})

	it('uses custom locale when specified', async () => {
		const context = await createStealthContext({ headless: true, locale: 'en-US' })
		try {
			const page = await context.newPage()
			const locale = await page.evaluate(() => navigator.language)
			assert.equal(locale, 'en-US')
			await page.close()
		} finally {
			await context.close()
		}
	})
})
