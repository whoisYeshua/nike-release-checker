import type { CountryCode, CountryLanguage } from '../models/availableCountries.ts'

export interface ProductFeedUrlParams {
	countryCode: CountryCode
	language: CountryLanguage
	chanelId?: string
	upcoming?: boolean
}

export const getProductFeedUrl = ({
	countryCode,
	language,
	chanelId = '010794e5-35fe-4e32-aaff-cd2c74f89d61',
	upcoming = true,
}: ProductFeedUrlParams) => {
	const url = new URL('https://api.nike.com/product_feed/threads/v3/')
	url.searchParams.append('filter', `marketplace(${countryCode})`)
	url.searchParams.append('filter', `language(${language})`)
	url.searchParams.append('filter', `channelId(${chanelId})`)
	url.searchParams.append('filter', `upcoming(${upcoming})`)
	url.searchParams.append('filter', 'exclusiveAccess(true,false)')

	return url
}
