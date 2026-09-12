import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import { executeStep, type StepResult } from '../executeStep.ts'
import { assertNotBlocked } from '../detectors/blockDetector.ts'
import { dismissCookieConsent } from '../dismissCookies.ts'

/**
 * Navigate to a Nike PDP for the API-first (hybrid) pipeline.
 *
 * Unlike `selectSize`, this does NOT click the size grid — the hybrid pipeline
 * resolves the SKU for the target size via `harvestSkuId` (window.__NEXT_DATA__
 * / Product Feed SDK) and carts it through the API, so a DOM size-click is dead
 * weight that only couples the bot to Nike's volatile size-grid selectors.
 *
 * This step's job is narrow and robust:
 *   1. Load the PDP (so `__NEXT_DATA__` is present for SKU harvesting AND Nike's
 *      own page scripts fire the protected requests the KPSDK extractor needs).
 *   2. Confirm we weren't blocked (Kasada/Akamai challenge page).
 *   3. Dismiss the cookie modal (best-effort).
 *   4. Wait briefly for `__NEXT_DATA__` hydration; not fatal if it never shows —
 *      `harvestSkuId` falls back to the Product Feed SDK.
 */
export async function navigatePdp(
	page: Page,
	productUrl: string,
	selectors: Selectors,
	timeoutMs = 15_000,
): Promise<StepResult> {
	return executeStep(
		'navigate-pdp',
		async () => {
			const gotoTimeout = Math.max(Math.floor(timeoutMs * 0.6), 8_000)
			const response = await page.goto(productUrl, {
				waitUntil: 'domcontentloaded',
				timeout: gotoTimeout,
			})
			await assertNotBlocked(page, response, selectors)
			await dismissCookieConsent(page, selectors, 800)
			// Best-effort wait for hydration JSON — harvestSkuId prefers it but has
			// an SDK fallback, so a timeout here is non-fatal.
			await page
				.waitForFunction(
					() => '__NEXT_DATA__' in window && Boolean((window as unknown as Record<string, unknown>)['__NEXT_DATA__']),
					{ timeout: Math.max(Math.floor(timeoutMs * 0.3), 3_000) },
				)
				.catch(() => undefined)
			return `navigated to ${page.url()}`
		},
		timeoutMs,
	)
}
