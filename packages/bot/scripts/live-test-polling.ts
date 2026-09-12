/**
 * Live test: Poll Nike FR Product Feed and show what's available right now.
 * Safe: read-only, hits public SNKRS API, no auth required.
 */
import { getProductFeed, formatProductFeedResponse } from '@nike-release-checker/sdk'
import { extractAvailableSizes } from '../src/monitor/poller.ts'

const startTime = Date.now()

console.log('[live-test] Hitting Nike FR Product Feed...')
console.log('[live-test] URL: https://api.nike.com/product_feed/threads/v3/ (marketplace=FR, language=fr)')

try {
  const feed = await getProductFeed({ countryCode: 'FR', language: 'fr' })
  const elapsed = Date.now() - startTime
  console.log(`[live-test] ✓ Response received in ${elapsed}ms — ${feed.length} raw objects`)

  const formatted = formatProductFeedResponse(feed)
  console.log(`[live-test] ✓ Formatted into ${formatted.length} releases`)

  // Classify by availability
  const withAvailableSizes = formatted.filter(
    (r) => extractAvailableSizes([r]).length > 0,
  )
  const withoutSizes = formatted.filter(
    (r) => extractAvailableSizes([r]).length === 0,
  )

  console.log('')
  console.log(`=== RELEASES WITH AVAILABLE SIZES (${withAvailableSizes.length}) ===`)
  for (const release of withAvailableSizes.slice(0, 10)) {
    const sizes = extractAvailableSizes([release])
    console.log(`  ${release.slug}`)
    console.log(`    title: ${release.title ?? '(no title)'}`)
    console.log(`    sizes: ${sizes.join(', ')}`)
  }
  if (withAvailableSizes.length > 10) {
    console.log(`  ... and ${withAvailableSizes.length - 10} more`)
  }

  console.log('')
  console.log(`=== RELEASES WITHOUT AVAILABLE SIZES (${withoutSizes.length}) ===`)
  for (const release of withoutSizes.slice(0, 5)) {
    console.log(`  ${release.slug} — ${release.title ?? '(no title)'}`)
  }
  if (withoutSizes.length > 5) {
    console.log(`  ... and ${withoutSizes.length - 5} more`)
  }

  console.log('')
  console.log('[live-test] ✅ Polling works live against Nike FR')
  process.exit(0)
} catch (err) {
  console.error('[live-test] ❌ Polling failed:', err)
  process.exit(1)
}
