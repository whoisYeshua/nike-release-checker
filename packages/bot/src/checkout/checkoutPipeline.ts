// checkoutPipeline — dispatcher that routes to domPipeline (v2) or hybridPipeline (v3)
// based on the `checkout.pipeline` config flag (Story 12.7).
//
// Default resolution:
//   - explicit `pipeline: 'hybrid'` → hybridPipeline
//   - explicit `pipeline: 'dom'` → domPipeline
//   - `tier: 'saas'` (and no explicit pipeline) → hybridPipeline
//   - otherwise → domPipeline (safe default for self-hosted)

import type { BrowserContext, Page } from 'playwright'
import type { BotConfig } from '../config/botConfigSchema.ts'
import type { AccountConfig } from '../config/accountSchema.ts'
import type { Selectors } from '../config/selectorSchema.ts'
import { createRealCheckoutContext } from '../stealth/realCheckoutContext.ts'
import type { RealChromeHandle } from '../stealth/realChrome.ts'
import { maskEmail } from '../logger/credentialMasker.ts'
import { registerContext, unregisterContext } from '../daemon/gracefulShutdown.ts'
import type { StepResult } from './executeStep.ts'
import type { FinalOutcome } from './outcomeClassifier.ts'
import type { ShippingAddress } from './steps/completeShipping.ts'
import type { CardData } from './steps/completePayment.ts'
import { runDomPipeline } from './pipelines/domPipeline.ts'
// Static import (NOT dynamic). A runtime `await import('./pipelines/hybridPipeline.ts')`
// makes tsx compile the whole hybrid module graph synchronously WHILE a CDP
// browser is already connected — the JS thread stalls long enough that the
// patchright/CDP WebSocket heartbeat times out and the browser disconnects,
// surfacing as "Target page, context or browser has been closed" on the very
// next page.goto. Importing at module load (before any browser launch) avoids
// the mid-session compile stall.
import { runHybridPipeline } from './pipelines/hybridPipeline.ts'

export interface CheckoutPipelineResult {
  accountId: string
  accountEmail: string
  steps: StepResult[]
  finalOutcome: FinalOutcome
  durationMs: number
}

export interface CheckoutPipelineOptions {
  productUrl: string
  targetSizes: string[]
  dryRun?: boolean
  /**
   * Pre-resolved shipping address — caller (CLI) reads from addresses.csv.
   * Optional: when omitted and the form is empty, completeShipping returns an
   * error outcome rather than guessing.
   */
  shippingAddress?: ShippingAddress
  /**
   * Pre-decrypted card payload — caller (CLI) unlocks the cards DB and pulls
   * the row before invoking. Optional for the same reason as shippingAddress.
   */
  card?: CardData
  /**
   * Hybrid-pipeline extra fields — only used when pipeline === 'hybrid'.
   */
  styleColor?: string
  slug?: string
  country?: string
  currency?: string
}

/**
 * Handle returned by `createCheckoutContext` — pairs the underlying real-Chrome
 * BrowserContext with the first usable Page, plus a `close()` to tear it down.
 *
 * Exposed so callers (e.g. WarmupController) can pre-launch contexts ahead of a
 * drop and then hand them to the checkout pipeline at T=0 with zero cold-start.
 */
export interface CheckoutContextHandle {
  context: BrowserContext
  page: Page
  close: () => Promise<void>
}

/**
 * Launch a real Chrome process for one account and return the prepared
 * BrowserContext + initial Page. Identical to the inline launch used at the top
 * of `runCheckoutPipeline`, just hoisted so it can be called independently
 * (warmup phase, integration tests, future parallel pre-launch, …).
 *
 * Callers MUST invoke `handle.close()` in a `finally` block — the BrowserContext
 * holds a Chrome subprocess.
 */
export async function createCheckoutContext(
  account: AccountConfig,
): Promise<CheckoutContextHandle> {
  const handle = await createRealCheckoutContext({
    accountId: account.id,
    headless: false, // Visible browser — Kasada blocks headless Chrome at accounts.nike.com
    ...(account.proxy ? { proxy: account.proxy } : {}),
  })
  // Always open a fresh tab — the initial about:blank page of a CDP-attached
  // Chrome can be reaped, leaving a dead handle that fails the first goto with
  // "Target page, context or browser has been closed".
  const page = await handle.context.newPage()
  return {
    context: handle.context,
    page,
    close: handle.close,
  }
}

// Internal: keep the launch wrapped so `runCheckoutPipeline` can reuse the
// helper without changing its existing no-session error semantics.
async function safeCreateRealCheckoutContext(
  account: AccountConfig,
): Promise<RealChromeHandle> {
  return createRealCheckoutContext({
    accountId: account.id,
    headless: false,
    ...(account.proxy ? { proxy: account.proxy } : {}),
  })
}

/**
 * Resolve the effective pipeline mode from config.
 * Priority: explicit `checkout.pipeline` > tier-based default > 'dom'.
 */
function resolvePipelineMode(config: BotConfig): 'dom' | 'hybrid' {
  const explicit = config.checkout?.pipeline
  if (explicit !== undefined) return explicit
  // DOM by default. The hybrid pipeline tries to cart via Nike's API directly,
  // but those endpoints are KPSDK-protected: every request needs a fresh
  // `x-kpsdk-cd` proof-of-work that only Kasada's obfuscated VM (p.js) can
  // compute — captured tokens are rejected (403, verified live 2026-05-04).
  // The DOM path drives the real browser, so Nike's own JS computes the PoW and
  // signs every cart/checkout request natively. That's the only path that works
  // without a paid Kasada solver. Set checkout.pipeline: 'hybrid' only if you
  // wire a solver into the KPSDK client.
  return 'dom'
}

export async function runCheckoutPipeline(
  account: AccountConfig,
  config: BotConfig,
  selectors: Selectors,
  options: CheckoutPipelineOptions,
): Promise<CheckoutPipelineResult> {
  const pipelineStart = performance.now()
  const maskedEmail = maskEmail(account.email)
  const { productUrl, targetSizes, dryRun = false, shippingAddress, card } = options

  console.log(`[checkout] Starting pipeline for ${maskedEmail}${dryRun ? ' [DRY-RUN]' : ''}`)

  let handle: RealChromeHandle
  try {
    handle = await safeCreateRealCheckoutContext(account)
  } catch (err) {
    if (err instanceof Error && err.message.includes('Session snapshot missing')) {
      console.log(`  No session for ${maskedEmail} — skipping. Run: nike-bot capture-session --account ${account.id}`)
      return {
        accountId: account.id,
        accountEmail: maskedEmail,
        steps: [],
        finalOutcome: 'no_session',
        durationMs: Math.round(performance.now() - pipelineStart),
      }
    }
    throw err
  }

  const context = handle.context
  registerContext(context)

  try {
    // Always open a fresh tab — see createCheckoutContext for the rationale.
    const page = await handle.context.newPage()
    const mode = resolvePipelineMode(config)

    // NOTE: `return await` (NOT bare `return`). A bare `return somePromise`
    // inside this try runs the `finally { await handle.close() }` block the
    // instant the promise is *created*, not when it *settles* — closing the
    // browser mid-pipeline and failing the first page.goto with "Target page,
    // context or browser has been closed". `await` defers the finally until the
    // pipeline actually completes.
    if (mode === 'hybrid') {
      return await runHybridPipeline(page, account, config, selectors, {
        productUrl,
        targetSizes,
        styleColor: options.styleColor ?? '',
        slug: options.slug ?? '',
        country: options.country,
        currency: options.currency,
        dryRun,
        shippingAddress: shippingAddress !== undefined
          ? {
              firstName: shippingAddress.firstName ?? '',
              lastName: shippingAddress.lastName ?? '',
              line1: shippingAddress.street,
              city: shippingAddress.city,
              postalCode: shippingAddress.zip,
              country: shippingAddress.country,
              phone: shippingAddress.phone ?? '',
            }
          : undefined,
        card,
      })
    }

    // DOM pipeline — v2 path unchanged.
    return await runDomPipeline(page, account, config, selectors, {
      productUrl,
      targetSizes,
      dryRun,
      shippingAddress,
      card,
    })
  } finally {
    unregisterContext(context)
    await handle.close().catch(() => undefined)
  }
}
