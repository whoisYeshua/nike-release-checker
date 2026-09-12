import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { buildLocaleConfig } from '../stealth/localeConfig.ts'
import { createStealthContext } from '../stealth/contextFactory.ts'

describe('buildLocaleConfig', () => {
	it('FR market returns fr-FR locale', () => {
		const cfg = buildLocaleConfig('FR')
		assert.equal(cfg.locale, 'fr-FR')
	})

	it('FR market returns Europe/Paris timezone', () => {
		const cfg = buildLocaleConfig('FR')
		assert.equal(cfg.timezoneId, 'Europe/Paris')
	})

	it('FR market returns Paris geolocation', () => {
		const cfg = buildLocaleConfig('FR')
		assert.ok(Math.abs(cfg.geolocation.latitude - 48.8566) < 0.001)
		assert.ok(Math.abs(cfg.geolocation.longitude - 2.3522) < 0.001)
	})

	it('FR market returns correct Accept-Language header', () => {
		const cfg = buildLocaleConfig('FR')
		assert.equal(
			cfg.extraHTTPHeaders['Accept-Language'],
			'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
		)
	})

	it('throws for unsupported market', () => {
		assert.throws(
			() => buildLocaleConfig('XX'),
			(err: Error) => {
				assert.ok(err.message.includes('Unsupported market'))
				return true
			},
		)
	})
})

describe('French locale signals in browser', () => {
	it('navigator.language is fr-FR', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			const lang = await page.evaluate(() => navigator.language)
			assert.equal(lang, 'fr-FR', 'navigator.language must be fr-FR')
			await page.close()
		} finally {
			await context.close()
		}
	})

	it('navigator.languages starts with fr-FR, fr', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			const langs = await page.evaluate(() => [...navigator.languages])
			assert.ok(langs[0] === 'fr-FR', `first language must be fr-FR, got: ${langs[0]}`)
			assert.ok(langs[1] === 'fr', `second language must be fr, got: ${langs[1]}`)
			await page.close()
		} finally {
			await context.close()
		}
	})

	it('Intl timezone is Europe/Paris', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
			assert.equal(tz, 'Europe/Paris', 'timezone must be Europe/Paris')
			await page.close()
		} finally {
			await context.close()
		}
	})

	it('geolocation resolves to Paris coordinates', async () => {
		const context = await createStealthContext({ headless: true })
		try {
			const page = await context.newPage()
			// Geolocation requires a secure origin — serve a local HTTPS page via route
			await page.route('https://test.local/', (route) =>
				route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
			)
			await page.goto('https://test.local/', { waitUntil: 'load' })

			const position = await page.evaluate(
				() =>
					new Promise<{ lat: number; lon: number }>((resolve, reject) => {
						navigator.geolocation.getCurrentPosition(
							(pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
							(err) => reject(new Error(err.message)),
						)
					}),
			)
			assert.ok(
				Math.abs(position.lat - 48.8566) < 0.01,
				`latitude must be ~48.8566, got: ${position.lat}`,
			)
			assert.ok(
				Math.abs(position.lon - 2.3522) < 0.01,
				`longitude must be ~2.3522, got: ${position.lon}`,
			)
			await page.close()
		} finally {
			await context.close()
		}
	})
})

// Optional E2E test — only runs when NIKE_TEST_LIVE=1 is set
if (process.env['NIKE_TEST_LIVE'] === '1') {
	describe('Nike France live smoke test', () => {
		it('nike.com/fr does not redirect to a different locale', async () => {
			const context = await createStealthContext({ headless: true })
			try {
				const page = await context.newPage()
				await page.goto('https://www.nike.com/fr/', {
					waitUntil: 'networkidle',
					timeout: 30_000,
				})
				assert.ok(page.url().includes('/fr/'), `Expected URL to contain /fr/, got: ${page.url()}`)
				const title = await page.title()
				assert.ok(title.length > 0, 'Page must have a non-empty title — blank title means blocked')
				await page.close()
			} finally {
				await context.close()
			}
		})
	})
}
