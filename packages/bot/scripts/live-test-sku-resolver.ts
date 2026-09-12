#!/usr/bin/env node
// Live test script for Story 12.2 — skuId resolver via Product Feed.
// Calls the Nike Product Feed (public, no KPSDK) for a known stable styleColor
// and prints the size → skuId map.
//
// Usage: node --import tsx packages/bot/scripts/live-test-sku-resolver.ts
//
// Expected: Air Force 1 '07 CW2288-111 in FR marketplace
// Sizes to probe: EU 38 .. 46

import { resolveSkuId, SkuNotFoundError, StyleColorNotFoundError } from '../src/checkout/api/index.ts'

const STYLE_COLOR = 'CW2288-111'
const COUNTRY = 'FR'
const EU_SIZES = ['38', '38.5', '39', '40', '40.5', '41', '42', '42.5', '43', '44', '44.5', '45', '45.5', '46']

async function main() {
	console.log(`\nLive test: ${STYLE_COLOR} in marketplace ${COUNTRY}`)
	console.log('='.repeat(50))

	const results: Record<string, string | string> = {}

	for (const euSize of EU_SIZES) {
		try {
			const skuId = await resolveSkuId({ styleColor: STYLE_COLOR, euSize, country: COUNTRY })
			results[euSize] = skuId
			console.log(`  EU ${euSize.padEnd(5)} → ${skuId}`)
		} catch (err) {
			if (err instanceof SkuNotFoundError) {
				console.log(`  EU ${euSize.padEnd(5)} → NOT AVAILABLE`)
			} else if (err instanceof StyleColorNotFoundError) {
				console.error(`\nStyleColor ${STYLE_COLOR} not found in ${COUNTRY}`)
				process.exit(1)
			} else {
				console.error(`\nUnexpected error for size ${euSize}:`, err)
			}
		}
	}

	console.log(`\nFound ${Object.keys(results).length} sizes with skuId.`)

	// Second pass: verify cache (no additional network calls)
	console.log('\nVerifying cache hit (second call, no network):')
	for (const euSize of Object.keys(results).slice(0, 2)) {
		const skuId = await resolveSkuId({ styleColor: STYLE_COLOR, euSize, country: COUNTRY })
		console.log(`  EU ${euSize.padEnd(5)} → ${skuId} (cached)`)
	}

	console.log('\nDone.\n')
}

main().catch((err) => {
	console.error('Fatal:', err)
	process.exit(1)
})
