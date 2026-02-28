import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'

import { formatProductFeedResponse } from './format.ts'

const REGION_BASELINES = [
	{ code: 'jp', title: 'JAPAN (JP)' },
	{ code: 'us', title: 'UNITED STATES (US)' },
	{ code: 'uk', title: 'UNITED KINGDOM (UK/GB)' },
]

const EXPECTED_FIXTURE_FILENAME = 'product-feed.expected.json'
const RAW_FIXTURE_FILENAME = 'product-feed.raw.json'

const isDateDir = (entryName: string) => {
	return /^\d{2}\.\d{2}\.\d{4}$/.test(entryName)
}

for (const { code, title } of REGION_BASELINES) {
	describe(`formatProductFeedResponse ${title}`, () => {
		const regionFixturesDir = path.resolve(import.meta.dirname, '__fixtures__', code)
		const dateDirs = readdirSync(regionFixturesDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && isDateDir(entry.name))
			.map((entry) => entry.name)

		for (const dateDir of dateDirs) {
			const datedFixturesDir = path.join(regionFixturesDir, dateDir)
			const expectedFixturePath = path.join(datedFixturesDir, EXPECTED_FIXTURE_FILENAME)
			const rawFixturePath = path.join(datedFixturesDir, RAW_FIXTURE_FILENAME)

			test(`keeps baseline output (${dateDir})`, async () => {
				const { default: rawFixture } = await import(rawFixturePath, { with: { type: 'json' } })
				const { default: expectedFixture } = await import(expectedFixturePath, {
					with: { type: 'json' },
				})

				const result = formatProductFeedResponse(rawFixture.objects)
				assert.partialDeepStrictEqual(result, expectedFixture)
			})
		}
	})
}
