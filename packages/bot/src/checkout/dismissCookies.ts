import type { Page } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'

/**
 * Nike pages show a cookie consent modal on first visit that blocks all interaction.
 * This helper clicks "Tout refuser" (or falls back to "Tout accepter") to dismiss it.
 *
 * If no `cookieConsent` selectors are configured or the modal is absent, returns false
 * silently — callers should NOT treat absence as an error.
 *
 * Returns `true` if the modal was dismissed, `false` if it was not present.
 */
export async function dismissCookieConsent(
  page: Page,
  selectors: Selectors,
  timeoutMs = 1500,
): Promise<boolean> {
  const cc = selectors.cookieConsent
  if (!cc?.modalRoot) return false

  // Wait briefly for the modal — do NOT throw if it never appears.
  const modal = page.locator(cc.modalRoot)
  try {
    await modal.waitFor({ state: 'visible', timeout: timeoutMs })
  } catch {
    return false
  }

  // Prefer decline (less tracking, faster for automation).
  const declineBtn = cc.declineButton ? page.locator(cc.declineButton) : null
  if (declineBtn && (await declineBtn.isVisible().catch(() => false))) {
    await declineBtn.click({ timeout: timeoutMs }).catch(() => {})
  } else if (cc.acceptButton) {
    const acceptBtn = page.locator(cc.acceptButton)
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click({ timeout: timeoutMs }).catch(() => {})
    } else {
      return false
    }
  } else {
    return false
  }

  // Wait for modal to disappear (max 1s — animations are fast)
  try {
    await modal.waitFor({ state: 'hidden', timeout: 1000 })
  } catch {
    // Modal may have been removed from DOM instead of hidden — treat as dismissed
  }
  return true
}
