import type { CountryInfo } from '../utils/countries'

interface ProductUrlParams {
	countryName: CountryInfo['name']
	language: CountryInfo['language']
	chanelId?: string
	upcoming?: boolean
}

export const getProductUrl = ({
	countryName,
	language,
	chanelId = '010794e5-35fe-4e32-aaff-cd2c74f89d61',
	upcoming = true,
}: ProductUrlParams) => {
	const url = new URL('https://api.nike.com/product_feed/threads/v3/')
	url.searchParams.append('filter', `marketplace(${countryName})`)
	url.searchParams.append('filter', `language(${language})`)
	url.searchParams.append('filter', `channelId(${chanelId})`)
	url.searchParams.append('filter', `upcoming(${upcoming})`)
	url.searchParams.append('filter', 'exclusiveAccess(true,false)')

	return url
}

https://api.nike.com/product_feed/threads/v3/?filter=marketplace(US)&filter=language(en)&filter=channelId(010794e5-35fe-4e32-aaff-cd2c74f89d61)&filter=exclusiveAccess(true,false)
https://api.nike.com/product_feed/threads/v3/?filter=marketplace(US)&filter=language(en)&filter=channelId(010794e5-35fe-4e32-aaff-cd2c74f89d61)&filter=upcoming(true)&filter=exclusiveAccess(true,false)