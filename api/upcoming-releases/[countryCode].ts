import {
	availableCountries,
	formatProductFeedResponse,
	getProductFeed,
} from '../../snkrs-sdk/index.ts'

const getTargetCountry = (countryCode: string) =>
	availableCountries.find(({ code }) => code === countryCode)

export async function GET(request: Request) {
	const url = new URL(request.url)
	const pathMatch = new URLPattern({ pathname: '/api/upcoming-releases/:countryCode' }).exec(url)
	const countryCode = pathMatch?.pathname.groups.countryCode?.toUpperCase()
	const targetCountry = countryCode ? getTargetCountry(countryCode) : null

	if (!targetCountry) {
		const acceptableCountries = availableCountries.map(({ code }) => code).join(', ')
		return Response.json(
			{ error: `Country not found. Acceptable countries: ${acceptableCountries}` },
			{ status: 400 }
		)
	}

	try {
		const data = await getProductFeed({
			countryCode: targetCountry.code,
			language: targetCountry.language,
		})

		const formatted = formatProductFeedResponse(data)
		return Response.json(formatted, { status: 200 })
	} catch (error) {
		console.error(error)
		return Response.json({ error: 'Internal Server Error' }, { status: 500 })
	}
}
