import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { styleText } from 'node:util'

import { formatProductFeedResponse } from '../productFeed/format.ts'

const SUPPORTED_REGIONS = ['jp', 'us', 'uk']

const parseRegions = (arg = ''): string[] => {
	const region = arg.toLowerCase()
	if (region === '' || region === 'all') return Array.from(SUPPORTED_REGIONS)
	if (!SUPPORTED_REGIONS.includes(region)) {
		throw new Error(`Unsupported region: ${region}. Supported: ${SUPPORTED_REGIONS.join(', ')}`)
	}
	return [region]
}

const regenerateRegionExpected = async (region: string) => {
	const todayDatePrefix = new Date().toLocaleDateString('RU')
	const fixturesDir = path.resolve(import.meta.dirname, '..', 'productFeed', '__fixtures__', region)
	const datedFixturesDir = path.join(fixturesDir, todayDatePrefix)
	const rawDataJsonPath = path.join(datedFixturesDir, 'product-feed.raw.json')
	const expectedPath = path.join(datedFixturesDir, 'product-feed.expected.json')

	const { default: rawFixture } = await import(rawDataJsonPath, { with: { type: 'json' } })
	const formatted = formatProductFeedResponse(rawFixture.objects)
	writeFileSync(expectedPath, JSON.stringify(formatted, null, 2), 'utf8')

	console.log(
		styleText(
			'green',
			`[${region.toUpperCase()}] wrote ${todayDatePrefix}/product-feed.expected.json (${formatted.length} releases)`
		)
	)
}

const regions = parseRegions(process.argv[2])
for (const region of regions) {
	await regenerateRegionExpected(region)
}
