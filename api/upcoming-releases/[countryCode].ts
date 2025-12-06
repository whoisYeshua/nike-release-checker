import { availableCountries, formatProductFeedResponse, getProductFeed } from '#snkrs-sdk'

import { getCachedFeed, upsertFeedCache } from '../lib/cache.ts'

import type { VercelRequest, VercelResponse } from '@vercel/node'

const getTargetCountry = (countryCode: string) =>
	availableCountries.find(({ code }) => code === countryCode)

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const rawCode = req.query.countryCode
	const countryCode = Array.isArray(rawCode) ? rawCode[0]?.toUpperCase() : rawCode?.toUpperCase()
  const targetCountry = countryCode ? getTargetCountry(countryCode) : null

	if (!targetCountry) {
		return res.status(400).json({ error: 'Country not found' })
	}

	try {
		const cached = await getCachedFeed(targetCountry.code)
		if (cached) {
			const formatted = formatProductFeedResponse(cached.data)
			return res.status(200).json(formatted)
		}

		const data = await getProductFeed({
			countryCode: targetCountry.code,
			language: targetCountry.language,
		})

		await upsertFeedCache(targetCountry.code, data)

		const formatted = formatProductFeedResponse(data)
		return res.status(200).json(formatted)
	} catch (error) {
		console.error(error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}
