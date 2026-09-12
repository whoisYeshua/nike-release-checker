import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import { executeStep, type StepResult } from '../executeStep.ts'
import { assertNotBlocked } from '../detectors/blockDetector.ts'
import { dismissCookieConsent } from '../dismissCookies.ts'
import { naturalClick } from '../naturalClick.ts'

export async function selectSize(
  page: Page,
  productUrl: string,
  targetSizes: string[],
  selectors: Selectors,
  timeoutMs = 8000,
): Promise<StepResult & { selectedSize?: string }> {
  let selectedSize: string | undefined

  if (targetSizes.length === 0) {
    return {
      step: 'select-size',
      outcome: 'error' as const,
      durationMs: 0,
      error: 'targetSizes array is empty — configure target sizes in bot.config.yaml or pass --sizes',
    }
  }

  const result = await executeStep(
    'select-size',
    async () => {
      // Use a shorter timeout for goto so subsequent operations still have time
      // within the executeStep race timer
      // Use 'domcontentloaded' (fires when HTML parsed, ~1-2s on Nike PDPs).
      // 'load' would wait for all images/3rd-party scripts (5-15s) — too slow.
      // The size grid hydrates from React after DOMContentLoaded, so we poll for it.
      const gotoTimeout = Math.max(Math.floor(timeoutMs * 0.3), 2000)
      const response = await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: gotoTimeout })
      await assertNotBlocked(page, response, selectors)
      // Dismiss Nike's cookie consent modal if it appears — otherwise it blocks clicks.
      await dismissCookieConsent(page, selectors, 800)
      // Trigger lazy hydration of size grid (often below initial viewport on Nike PDPs)
      await page.evaluate(() => window.scrollTo(0, 800)).catch(() => {})
      await page.waitForTimeout(300)

      // Generous selector wait — React hydration on a fully loaded PDP can take 5-10s
      // on cold cache. Spend most of the step budget here.
      const selectorTimeout = Math.max(Math.floor(timeoutMs * 0.6), 5000)

      // A SNKRS product that hasn't dropped yet shows a "Prévenir / Notify me /
      // Bientôt disponible" CTA and NO size grid. Race the size grid against
      // that not-available signal so we DON'T burn the whole timeout on an
      // unreleased pair — instead surface SOLD_OUT fast so the caller (run loop)
      // moves to the next drop. Broaden the grid wait to cover both the catalog
      // (/fr/t/) and SNKRS launch (/fr/launch/t/) DOM variants.
      const gridSelector = [
        selectors.productPage.sizeGrid,
        '[data-testid="pdp-grid-selector-item"]',
        '[data-testid="size-selector"] input[type="radio"]',
        '[data-testid="grid-selector-input"]',
        // SNKRS launch pages (/fr/launch/t/) render sizes as buttons named
        // size_item_radio_<uuid> with text "EU 42" — no data-testid, no grid item.
        'button[name^="size_item_radio_"]',
      ].filter(Boolean).join(', ')
      const notAvailableSelector = [
        selectors.productPage.soldOutIndicator,
        'button:has-text("Prévenir")',
        'button:has-text("Me prévenir")',
        'button:has-text("Notify me")',
        'button:has-text("Notifiez-moi")',
        'button:has-text("Bientôt disponible")',
        'button:has-text("Coming soon")',
        '[data-testid="sold-out-indicator"]',
      ].filter(Boolean).join(', ')

      const outcome = await Promise.race([
        page.waitForSelector(gridSelector, { timeout: selectorTimeout, state: 'attached' })
          .then(() => 'grid' as const)
          .catch(() => null),
        page.waitForSelector(notAvailableSelector, { timeout: selectorTimeout, state: 'visible' })
          .then(() => 'unavailable' as const)
          .catch(() => null),
      ])
      if (outcome === 'unavailable') {
        throw Object.assign(
          new Error('Product not yet live (Notify me / sold out button) — skipping to next'),
          { code: 'SOLD_OUT' },
        )
      }
      if (outcome === null) {
        // Neither appeared within the budget → genuine timeout (slow page / changed DOM).
        throw Object.assign(
          new Error(`Size grid not found within ${selectorTimeout}ms`),
          { code: 'TIMEOUT' },
        )
      }

      // Nike's size grid uses a <div data-testid="pdp-grid-selector-item">
      // wrapper containing a hidden <input type="radio"> + visible <label>.
      // When a size is picked, testid flips to "pdp-grid-selector-item-selected".
      // We click the LABEL via naturalClick (Kasada-friendly), then verify
      // the selected variant appeared. If not, fall back to input.check() via
      // page.evaluate which guarantees the radio is checked.
      const grid = page.locator(selectors.productPage.sizeGrid)
      for (const size of targetSizes) {
        const escaped = size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`^\\s*EU\\s+${escaped}\\s*$`)
        const sizeItem = grid.filter({ hasText: re }).first()
        const count = await sizeItem.count()
        if (count === 0) continue
        const isVisible = await sizeItem.isVisible().catch(() => false)
        if (!isVisible) continue

        // Strategy 1: naturalClick on the wrapper div (clicks the visible label)
        await naturalClick(page, sizeItem).catch(() => {})
        await page.waitForTimeout(400)

        // Verify selection by looking for the SELECTED variant of the testid
        const selectedLoc = page
          .locator('[data-testid="pdp-grid-selector-item-selected"]')
          .filter({ hasText: re })
        let selected = (await selectedLoc.count()) > 0

        // Strategy 2 (fallback): trigger the radio input directly via evaluate
        if (!selected) {
          await page.evaluate((sz) => {
            const items = document.querySelectorAll('[data-testid="pdp-grid-selector-item"]')
            for (const el of items) {
              if ((el.textContent ?? '').trim() === `EU ${sz}`) {
                const input = el.querySelector('input[type="radio"]') as HTMLInputElement | null
                if (input) {
                  input.click()
                  input.dispatchEvent(new Event('change', { bubbles: true }))
                }
                break
              }
            }
          }, size)
          await page.waitForTimeout(400)
          selected = (await selectedLoc.count()) > 0
        }

        if (selected) {
          selectedSize = size
          return `size:${size}`
        }
        // If neither strategy selected, try the next target size.
      }

      // SNKRS launch layout: sizes are <button name="size_item_radio_<uuid>">
      // with text "EU 42" (no pdp-grid-selector-item). Click the matching button.
      for (const size of targetSizes) {
        const escaped = size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`^\\s*EU\\s+${escaped}\\s*$`)
        const btn = page.locator('button[name^="size_item_radio_"]').filter({ hasText: re }).first()
        if ((await btn.count()) === 0) continue
        if (!(await btn.isEnabled().catch(() => false))) continue // greyed-out = that size sold out
        await naturalClick(page, btn).catch(() => {})
        await page.waitForTimeout(300)
        // Selection confirmed if the button is now pressed/checked, or an
        // add-to-cart/buy CTA became enabled. Best-effort: assume success on click.
        selectedSize = size
        return `size:${size}`
      }

      throw Object.assign(
        new Error(`No size available from: ${targetSizes.join(', ')}`),
        { code: 'SOLD_OUT' },
      )
    },
    timeoutMs,
  )

  return { ...result, selectedSize }
}
