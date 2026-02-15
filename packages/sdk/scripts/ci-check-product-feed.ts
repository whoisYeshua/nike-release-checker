import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { array, flatten, safeParse } from 'valibot'

import { availableCountries } from '../models/availableCountries.ts'
import { getProductFeed } from '../productFeed/api.ts'
import { ProductFeedSchema } from '../productFeed/schema.ts'

/**
 * Disclaimer:
 * Makes live SNKRS API requests and writes rotation state to `.gh-cache/product-feed-state.json`.
 * use only for CI health checks.
 */

interface StateFile {
	lastIndex: number
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const stateDir = path.join(repoRoot, '.gh-cache')
const statePath = path.join(stateDir, 'product-feed-state.json')

const eligibleCountries = availableCountries.filter((country) => !country.description)

if (eligibleCountries.length === 0) {
	throw new Error('No eligible countries found (description is empty).')
}

const readState = async (): Promise<StateFile> => {
	if (!existsSync(statePath)) {
		return { lastIndex: -1 }
	}

	try {
		const raw = await readFile(statePath, 'utf8')
		const parsed = JSON.parse(raw) as Partial<StateFile>
		if (typeof parsed.lastIndex === 'number' && parsed.lastIndex >= -1) {
			return { lastIndex: parsed.lastIndex }
		}
	} catch {
		// ignore and fall through to default
	}

	return { lastIndex: -1 }
}

const writeState = async (state: StateFile) => {
	await mkdir(stateDir, { recursive: true })
	await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8')
}

const formatIssues = (issues: Record<string, unknown> | string[]) => JSON.stringify(issues, null, 2)

const { lastIndex } = await readState()
const nextIndex = (lastIndex + 1) % eligibleCountries.length
const country = eligibleCountries[nextIndex]

console.log(`Checking product feed for ${country.code} (${country.name})`)

const response = await getProductFeed({
	countryCode: country.code,
	language: country.language,
})

const result = safeParse(array(ProductFeedSchema), response)

if (!result.success) {
	const { root, nested } = flatten(result.issues)
	const message = `ProductFeed validation failed for ${country.code} (${country.name})`
	const detail = [
		root ? `Root: ${formatIssues(root)}` : null,
		nested ? `Nested:\n${formatIssues(nested)}` : null,
	]
		.filter(Boolean)
		.join('\n')
	throw new Error(`${message}\n${detail}`)
}

await writeState({ lastIndex: nextIndex })

console.log(`Validation passed for ${country.code} (${country.name}); next index: ${nextIndex}`)
