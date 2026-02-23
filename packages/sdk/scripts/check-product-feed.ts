import { array, flatten, safeParse } from 'valibot'

import { availableCountries } from '../models/availableCountries.ts'
import { getProductFeed } from '../productFeed/api.ts'
import { ProductFeedSchema } from '../productFeed/schema.ts'

const formatIssues = (issues: Record<string, unknown> | string[]) => JSON.stringify(issues, null, 2)

const eligibleCountries = availableCountries.filter((country) => !country.description)

const randomIndex = Math.floor(Math.random() * eligibleCountries.length)
const index = process.argv[2] ? parseInt(process.argv[2]) : randomIndex // npm run check-product-feed 15
const country = eligibleCountries[index]

console.log(`Index: ${index}`)

const response = await getProductFeed({ countryCode: country.code, language: country.language })

const result = safeParse(array(ProductFeedSchema), response)

if (!result.success) {
	const { root, nested } = flatten(result.issues)
	const message = `ProductFeed validation failed for ${country.code}`
	const detail = [
		root ? `Root: ${formatIssues(root)}` : null,
		nested ? `Nested:\n${formatIssues(nested)}` : null,
	]
		.filter(Boolean)
		.join('\n')
	throw new Error(`${message}\n${detail}`)
}

console.log(`Validation passed for ${country.code}`)
