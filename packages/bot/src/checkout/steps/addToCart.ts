import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import { executeStep, type StepResult } from '../executeStep.ts'
import { checkSoldOut } from '../detectors/soldOutDetector.ts'
import { naturalClick } from '../naturalClick.ts'

export async function addToCart(
  page: Page,
  selectors: Selectors,
  timeoutMs = 8000,
): Promise<StepResult> {
  return executeStep(
    'add-to-cart',
    async () => {
      // Check if sold out using all three signals
      const soldOutResult = await checkSoldOut(page, selectors)
      if (soldOutResult.soldOut) {
        throw Object.assign(
          new Error(`Product is sold out (signal: ${soldOutResult.signal})`),
          { code: 'SOLD_OUT' },
        )
      }

      // Locate the buy/add-to-cart CTA. Catalog (/fr/t/) uses the configured
      // atb-button; SNKRS launch (/fr/launch/t/) uses an "Acheter <price>" button
      // that goes straight to checkout. Try the configured selector first, then
      // text-based fallbacks.
      const ctaCandidates = [
        selectors.productPage.addToCartButton,
        'button[data-testid="atb-button"]',
        'button:has-text("Ajouter au panier")',
        'button:has-text("Acheter")',
        'button:has-text("Add to Bag")',
        'button:has-text("Buy")',
      ].filter(Boolean)
      let atcButton: ReturnType<Page['locator']> | null = null
      for (const sel of ctaCandidates) {
        const loc = page.locator(sel).first()
        if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
          if (await loc.isEnabled().catch(() => false)) { atcButton = loc; break }
        }
      }
      if (!atcButton) {
        throw Object.assign(new Error('Add to cart / buy button not available'), { code: 'SOLD_OUT' })
      }

      await naturalClick(page, atcButton)

      // Use shorter timeout than the executeStep race timer to avoid ghost timeout
      const innerTimeout = Math.max(Math.floor(timeoutMs * 0.7), 2000)
      // Success = EITHER the cart count badge updates (catalog), OR Nike routes
      // to the checkout / cart page (SNKRS "Acheter" goes straight there).
      const outcome = await Promise.race([
        page.waitForSelector(selectors.cart.cartCount, { timeout: innerTimeout }).then(() => 'cart' as const).catch(() => null),
        page.waitForURL(/\/(checkout|cart)\b/i, { timeout: innerTimeout }).then(() => 'checkout' as const).catch(() => null),
        page.waitForSelector('h2:has-text("Paiement"), input[name="paymentOptions"], h2:has-text("Récapitulatif")', { timeout: innerTimeout, state: 'attached' }).then(() => 'checkout' as const).catch(() => null),
      ])
      if (!outcome) {
        throw Object.assign(new Error('Add to cart clicked but neither cart nor checkout confirmed'), { code: 'TIMEOUT' })
      }

      return outcome === 'checkout' ? 'added-to-cart-direct-checkout' : 'added-to-cart'
    },
    timeoutMs,
  )
}
