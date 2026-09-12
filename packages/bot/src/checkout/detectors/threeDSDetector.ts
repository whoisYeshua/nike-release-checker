import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'

export interface ThreeDSDetectResult {
  required: boolean
  iframeSelector?: string
}

/**
 * Detect whether a 3DS challenge iframe is present on the current page.
 */
export async function detect3DS(
  page: Page,
  selectors: Selectors,
): Promise<ThreeDSDetectResult> {
  // Try checkout-specific selector first
  const checkoutIframeSelector = selectors.checkout?.threeDSIframe
  if (checkoutIframeSelector) {
    try {
      const el = page.locator(checkoutIframeSelector)
      const isVisible = await el.isVisible()
      if (isVisible) {
        return { required: true, iframeSelector: checkoutIframeSelector }
      }
    } catch {
      // not found
    }
  }

  // Fall back to top-level selector
  const topLevelSelector = selectors.threeDSecureIframe
  if (topLevelSelector) {
    try {
      const el = page.locator(topLevelSelector)
      const isVisible = await el.isVisible()
      if (isVisible) {
        return { required: true, iframeSelector: topLevelSelector }
      }
    } catch {
      // not found
    }
  }

  return { required: false }
}

/**
 * Wait for the 3DS iframe to disappear (user completed challenge).
 * Returns true on completion, false on timeout.
 */
export async function waitFor3DSCompletion(
  page: Page,
  iframeSelector: string,
  timeoutMs = 300_000, // 5 minutes — user needs time to complete
): Promise<boolean> {
  try {
    await page.waitForSelector(iframeSelector, {
      state: 'hidden',
      timeout: timeoutMs,
    })
    return true
  } catch {
    return false
  }
}
