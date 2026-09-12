import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import { executeStep, type StepResult } from '../executeStep.ts'
import { naturalClick } from '../naturalClick.ts'

const THREE_DS_MESSAGE =
  '⚠️ APPROVE 3-D SECURE — approve payment in your banking app (Revolut/bank). Short window!'

/**
 * Loudly alert the operator that the order is awaiting 3-D Secure approval.
 * Nike/Adyen SCA on a real card almost always triggers 3DS — frequently
 * OUT-OF-BAND (a push to the bank app, e.g. Revolut) with NO in-page challenge,
 * and the approval window is short. We surface it on every channel we can:
 * an in-page red blinking banner + audible beep + browser Notification (the
 * Chrome window is on screen), a terminal bell, and a native macOS notification
 * with sound (fires even if the terminal/browser isn't focused).
 */
async function notify3DS(page: Page): Promise<void> {
  await page
    .evaluate((msg) => {
      try {
        var id = 'nikebot-3ds-banner'
        if (!document.getElementById(id)) {
          var b = document.createElement('div')
          b.id = id
          b.textContent = msg
          b.setAttribute(
            'style',
            'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#d50000;color:#fff;font:bold 18px/1.4 system-ui,sans-serif;padding:16px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.6)',
          )
          ;(document.body || document.documentElement).appendChild(b)
          var on = 0
          var t = setInterval(function () { b.style.background = on++ % 2 ? '#d50000' : '#ff8a80' }, 500)
          setTimeout(function () { clearInterval(t) }, 30000)
        }
        try {
          var Ac = (window as any).AudioContext || (window as any).webkitAudioContext
          if (Ac) { var ac = new Ac(); var o = ac.createOscillator(); var g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.2; o.start(); setTimeout(function () { o.stop(); if (ac.close) ac.close() }, 700) }
        } catch (e) {}
        try {
          if ((window as any).Notification) {
            var N = (window as any).Notification
            if (N.permission === 'granted') new N('Nike Bot — 3-D Secure', { body: msg })
            else if (N.permission !== 'denied') N.requestPermission().then(function (p: string) { if (p === 'granted') new N('Nike Bot — 3-D Secure', { body: msg }) })
          }
        } catch (e) {}
      } catch (e) {}
    }, THREE_DS_MESSAGE)
    .catch(() => {})
  try { process.stderr.write('\x07\n*** ' + THREE_DS_MESSAGE + ' ***\n') } catch {}
  if (process.platform === 'darwin') {
    try {
      const { spawn } = await import('node:child_process')
      spawn(
        'osascript',
        ['-e', 'display notification "Approve payment in your banking app" with title "Nike Bot — 3-D Secure" sound name "Glass"'],
        { stdio: 'ignore', detached: true },
      ).unref()
    } catch {}
  }
}

/**
 * Poll up to `ms` for the order to either confirm or land on an error page.
 * Returns 'confirmed' | 'error' | 'pending'.
 */
async function checkOrderState(page: Page, confirmSelector: string, ms: number): Promise<'confirmed' | 'error' | 'pending'> {
  const confirmed = await Promise.race([
    page.waitForSelector(confirmSelector, { timeout: ms }).then(() => true).catch(() => false),
    page.waitForURL(/\/(orders?|confirmation|order-confirmation|thank|merci)\b/i, { timeout: ms }).then(() => true).catch(() => false),
  ])
  if (confirmed) return 'confirmed'
  const errored = await page
    .locator('h1:has-text("Erreur"), h1:has-text("Error"), h2:has-text("Erreur"), h2:has-text("Error"), :text("paiement a été refusé"), :text("paiement a échoué"), :text("payment was declined"), :text("payment failed"), :text("carte a été refusée"), :text("card was declined")')
    .first()
    .isVisible()
    .catch(() => false)
  return errored ? 'error' : 'pending'
}

export async function submitOrder(
  page: Page,
  selectors: Selectors,
  dryRun = false,
  timeoutMs = 8000,
): Promise<StepResult> {
  // dry-run check MUST be the FIRST code that runs, before any page interaction
  if (dryRun) {
    return {
      step: 'submit-order',
      outcome: 'success',
      durationMs: 0,
      details: '[DRY-RUN] Order submission skipped',
    }
  }

  return executeStep(
    'submit-order',
    async () => {
      // Button interactions (review-enable, submit-enable, quick confirm) use a
      // SHORT bound capped at 25s. The final 3DS confirmation wait is much longer
      // (see below) but lives inside the executeStep race timer, so callers must
      // pass a generous `timeoutMs` for real runs (≈200s).
      const innerTimeout = Math.min(Math.max(Math.floor(timeoutMs * 0.7), 2000), 25_000)

      // Nike's checkout has a progressive 2-stage finish (verified live 2026-05-29
      // on /fr/checkout). Stage 1: the payment step shows a button
      //   <button data-attr="continueToOrderReviewBtn" aria-disabled="true">
      //     Continuer pour voir le récapitulatif de la commande
      // that ENABLES only once the card passes client validation. Stage 2: clicking
      // it reveals the order review whose final CTA is "Soumettre le paiement"
      // (NOT "Passer la commande" on SNKRS launches). Click stage 1 first, waiting
      // for it to enable — aria-disabled, not the `disabled` attribute.
      const toReview = page.locator('[data-attr="continueToOrderReviewBtn"]').first()
      if ((await toReview.count().catch(() => 0)) > 0) {
        const reviewDeadline = Date.now() + innerTimeout
        let reviewEnabled = false
        while (Date.now() < reviewDeadline) {
          if (await page.locator(selectors.checkout.threeDSIframe).isVisible().catch(() => false)) {
            throw Object.assign(new Error('3DS challenge required before order review'), { code: '3DS_REQUIRED' })
          }
          if ((await toReview.getAttribute('aria-disabled').catch(() => null)) !== 'true') { reviewEnabled = true; break }
          await page.waitForTimeout(300)
        }
        if (!reviewEnabled) {
          throw Object.assign(
            new Error('order-review button stayed disabled (payment not accepted by Nike)'),
            { code: 'ERROR' },
          )
        }
        await naturalClick(page, toReview)
        await page.waitForTimeout(1000)
      } else {
        // Older single-stage layouts: a plain "Continuer pour voir le récapitulatif".
        const legacy = page
          .locator('button:has-text("Continuer pour voir le récapitulatif"), button:has-text("Voir le récapitulatif")')
          .first()
        if (await legacy.isVisible({ timeout: 1500 }).catch(() => false)) {
          await naturalClick(page, legacy)
          await page.waitForTimeout(800)
        }
      }

      // Final submit. Combine the configured selector with hardcoded fallbacks so a
      // stale user selectors.yaml (missing "Soumettre le paiement") still works.
      const submitSelector = [
        selectors.checkout.submitOrderButton,
        'button:has-text("Soumettre le paiement")',
        'button:has-text("Passer la commande")',
        'button:has-text("Payer maintenant")',
        'button[type="submit"]:has-text("Payer")',
      ].filter(Boolean).join(', ')
      const submitButton = page.locator(submitSelector).first()

      // Wait for the button to appear AND become enabled. Nike disables it for
      // ~0.8–2.5s while the card iframe validates and the order total settles;
      // an immediate isEnabled() check races that window and false-times-out.
      // `waitFor` only checks visibility, so poll enabled state until the deadline.
      await submitButton.waitFor({ state: 'visible', timeout: innerTimeout }).catch(() => {
        throw Object.assign(new Error('Submit order button never appeared'), { code: 'TIMEOUT' })
      })
      const enabledDeadline = Date.now() + innerTimeout
      let enabled = false
      while (Date.now() < enabledDeadline) {
        // A 3DS challenge can appear before/while the button enables — surface it.
        if (await page.locator(selectors.checkout.threeDSIframe).isVisible().catch(() => false)) {
          throw Object.assign(new Error('3DS challenge required before order submit'), { code: '3DS_REQUIRED' })
        }
        enabled = await submitButton.isEnabled().catch(() => false)
        if (enabled) break
        await page.waitForTimeout(300)
      }
      if (!enabled) {
        throw Object.assign(new Error('Submit order button stayed disabled (card validation / 3DS pending)'), { code: 'TIMEOUT' })
      }
      // Small settle buffer for React re-render after enable.
      await page.waitForTimeout(300)

      await naturalClick(page, submitButton)

      // Confirm via EITHER the confirmation content OR a redirect to an
      // order/confirmation URL ("Merci !"). On a real card, submitting almost
      // always kicks off 3-D Secure (SCA) — usually OUT-OF-BAND (a push to the
      // bank app, e.g. Revolut) with no in-page challenge. So: try a quick
      // frictionless window first; if it doesn't land, ALERT the operator to
      // approve 3DS on their phone and wait patiently (the approval window is
      // short but the whole thing can take a couple of minutes).
      const confirmSelector = [
        selectors.checkout.orderConfirmation,
        'h1:has-text("Commande confirmée")',
        'h1:has-text("Merci")',
        'h2:has-text("Commande confirmée")',
        'h1:has-text(" commande est confirmée")',
        '[data-attr*="confirmation" i]',
      ].filter(Boolean).join(', ')

      const quick = await checkOrderState(page, confirmSelector, Math.min(innerTimeout, 6000))
      if (quick === 'confirmed') return 'order-submitted'
      if (quick === 'error') {
        throw Object.assign(new Error('payment error after submit (card declined / 3DS failed)'), { code: 'ERROR' })
      }

      // Not frictionless → 3DS approval almost certainly required. Alert + wait.
      await notify3DS(page).catch(() => {})
      const deadline = Date.now() + Math.max(innerTimeout, 165_000)
      while (Date.now() < deadline) {
        const s = await checkOrderState(page, confirmSelector, 2500)
        if (s === 'confirmed') return 'order-submitted-after-3ds'
        if (s === 'error') {
          throw Object.assign(new Error('payment error after 3DS (declined / not approved)'), { code: 'ERROR' })
        }
      }
      throw Object.assign(
        new Error('order submitted but not confirmed in time — 3DS not approved? (approve in your bank app, then retry)'),
        { code: 'THREEDS_TIMEOUT' },
      )
    },
    timeoutMs,
  )
}
