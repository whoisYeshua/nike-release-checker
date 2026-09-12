import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import { executeStep, type StepResult } from '../executeStep.ts'
import { dismissCookieConsent } from '../dismissCookies.ts'

export async function navigateCheckout(
  page: Page,
  selectors: Selectors,
  timeoutMs = 8000,
): Promise<StepResult> {
  return executeStep(
    'navigate-checkout',
    async () => {
      // Navigate DIRECTLY to /fr/checkout — bypasses the cart-page intermediate
      // step which is flaky (button disappears mid-render when the cart has
      // duplicate items from prior runs in the persistent profile). The
      // checkout page itself reads the cart server-side, so this is equivalent.
      const gotoTimeout = Math.max(Math.floor(timeoutMs * 0.4), 3000)
      await page.goto('https://www.nike.com/fr/checkout', { waitUntil: 'domcontentloaded', timeout: gotoTimeout })
      await dismissCookieConsent(page, selectors, 500)

      // Check for block detection AFTER navigation (Nike serves block pages here)
      const blockLocator = page.locator(selectors.blockDetectionSignal)
      const isBlocked = await blockLocator.isVisible()
      if (isBlocked) {
        throw Object.assign(new Error('Bot detection signal found'), { code: 'BLOCKED' })
      }

      // Confirm we're on the checkout page. Nike's checkout is a single
      // progressive SPA whose section buttons ("Enregistrer et continuer",
      // "Paiement"…) appear/disappear as sections expand — waiting for one
      // specific submit button is flaky. Instead wait for ANY stable structural
      // landmark that's always present once the checkout has hydrated: the order
      // summary / delivery / payment headings, OR the shipping continue button.
      const innerTimeout = Math.max(Math.floor(timeoutMs * 0.6), 2000)
      const landmark = [
        selectors.checkout.shippingContinueButton,
        'h2:has-text("Récapitulatif de la commande")',
        'h2:has-text("Options de livraison")',
        'h2:has-text("Paiement")',
        'input[name="paymentOptions"]',
      ].join(', ')
      await page.waitForSelector(landmark, { timeout: innerTimeout, state: 'attached' })

      return 'checkout-page-reached'
    },
    timeoutMs,
  )
}
