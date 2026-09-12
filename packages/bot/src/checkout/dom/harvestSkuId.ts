// harvestSkuId — two-tier strategy to extract skuId for a given size:
//   1. window.__NEXT_DATA__ hydration (fast, no HTTP, fragile if Nike changes shape)
//   2. Product Feed SDK call via resolveSkuId (stable, slower — Story 12.2 fallback)
//
// Story 12.7, FR69.

import type { Page } from 'playwright'
import { resolveSkuId } from '../api/skuResolver.ts'

export interface HarvestSkuIdArgs {
	styleColor: string
	euSize: string
	country: string
}

/**
 * Returns the skuId matching the requested EU size for the PDP currently loaded
 * in `page`. Tries the hydration JSON first (no network round-trip), then falls
 * back to the Product Feed SDK (Story 12.2) if hydration is unavailable or
 * returns no match.
 */
export const harvestSkuId = async (
	page: Page,
	args: HarvestSkuIdArgs,
): Promise<string> => {
	// Strategy 1: extract from window.__NEXT_DATA__ hydration JSON.
	// The prop path is `props.pageProps.product.skus[].{localizedSize,nikeSize,skuId}`.
	const fromHydration: string | undefined = await page
		.evaluate(({ size }: { size: string }) => {
			const data = ((window as unknown) as Record<string, unknown>)['__NEXT_DATA__'] as
				| { props?: { pageProps?: { product?: { skus?: Array<{ localizedSize?: string; nikeSize?: string; skuId?: string }> } } } }
				| undefined
			const skus = data?.props?.pageProps?.product?.skus ?? []
			const match = skus.find(
				(s) => s.localizedSize === size || s.nikeSize === size,
			)
			return match?.skuId ?? undefined
		}, { size: args.euSize })
		.catch(() => undefined)

	if (fromHydration !== undefined && fromHydration !== '') return fromHydration

	// Strategy 2: fall back to Product Feed SDK (Story 12.2).
	return resolveSkuId({
		styleColor: args.styleColor,
		euSize: args.euSize,
		country: args.country,
	})
}
