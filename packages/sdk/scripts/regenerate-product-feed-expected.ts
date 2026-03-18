import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { styleText } from 'node:util'

import { formatProductFeedResponse } from '../productFeed/format.ts'
import { getProductFeedUrl } from '../productFeed/url.ts'
import { rest } from '../utils/rest.ts'

import type { CountryCode, CountryLanguage } from '../models/availableCountries.ts'
import type { ProductFeedResponseOutput } from '../productFeed/schema.ts'

const REGION_CONFIG = {
	jp: { countryCode: 'JP', language: 'ja' },
	us: { countryCode: 'US', language: 'en' },
	gb: { countryCode: 'GB', language: 'en-GB' },
} as const satisfies Record<string, { countryCode: CountryCode; language: CountryLanguage }>

type Region = keyof typeof REGION_CONFIG

const SUPPORTED_REGIONS = Object.keys(REGION_CONFIG) as Region[]

const parseRegions = (arg = ''): Region[] => {
	const region = arg.toLowerCase()
	if (region === '' || region === 'all') return Array.from(SUPPORTED_REGIONS)
	if (!SUPPORTED_REGIONS.includes(region as Region)) {
		throw new Error(`Unsupported region: ${region}. Supported: ${SUPPORTED_REGIONS.join(', ')}`)
	}
	return [region as Region]
}

const formatFixtureDate = (date: Date) => {
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const year = String(date.getFullYear())
	return `${day}.${month}.${year}`
}

const fetchProductFeedResponse = async ({
	countryCode,
	language,
}: {
	countryCode: CountryCode
	language: CountryLanguage
}) => {
	const url = getProductFeedUrl({ countryCode, language })
	return rest.get<ProductFeedResponseOutput>({ url })
}

const regenerateRegionExpected = async (region: Region) => {
	const todayDatePrefix = formatFixtureDate(new Date())
	const fixturesDir = path.resolve(import.meta.dirname, '..', 'productFeed', '__fixtures__', region)
	const datedFixturesDir = path.join(fixturesDir, todayDatePrefix)
	const rawDataJsonPath = path.join(datedFixturesDir, 'product-feed.raw.json')
	const expectedPath = path.join(datedFixturesDir, 'product-feed.expected.json')

	await mkdir(datedFixturesDir, { recursive: true })

	const rawFixture = await fetchProductFeedResponse(REGION_CONFIG[region])
	const formatted = formatProductFeedResponse(rawFixture.objects)

	await writeFile(rawDataJsonPath, JSON.stringify(rawFixture, null, 2), 'utf8')
	await writeFile(expectedPath, JSON.stringify(formatted, null, 2), 'utf8')

	console.log(
		styleText(
			'green',
			`[${region.toUpperCase()}] wrote ${todayDatePrefix}/product-feed.raw.json and product-feed.expected.json (${formatted.length} releases)`
		)
	)
}

const regions = parseRegions(process.argv[2])
for (const region of regions) {
	await regenerateRegionExpected(region)
}
