import type { BotConfig } from '../config/botConfigSchema.ts'
import { validateAllSessions, printValidationSummary } from '../auth/preCheckoutValidation.ts'
import { runParallelCheckout } from '../checkout/parallelCheckout.ts'
import { printCheckoutSummary } from '../logger/terminal.ts'
import { startPolling } from './poller.ts'
import { StockTracker } from './stockTracker.ts'
import { log } from '../logger/logger.ts'

export interface AutoCheckoutOptions {
  slug: string
  productUrl: string
  targetSizes: string[]
  dryRun?: boolean
  configPath?: string
  selectorsPath?: string
  autoCheckout?: boolean
}

/**
 * Start monitoring a product and auto-trigger checkout when stock is detected.
 * Accepts an AbortController — uses controller.signal for polling and
 * controller.abort() to stop when checkout succeeds.
 */
export async function startMonitorAndCheckout(
  options: AutoCheckoutOptions,
  config: BotConfig,
  controller: AbortController,
): Promise<void> {
  const {
    slug,
    productUrl,
    targetSizes,
    dryRun = false,
    configPath,
    selectorsPath,
    autoCheckout = true,
  } = options

  // Validate sessions before starting
  const sessionResults = await validateAllSessions()
  printValidationSummary(sessionResults)

  const validSessions = sessionResults.filter((r) => r.valid)
  if (validSessions.length === 0) {
    throw new Error('No valid sessions found. Run nike-bot login-all first.')
  }

  if (!autoCheckout) {
    log('info', `Auto-checkout disabled — monitoring ${slug} without checkout trigger`)
  }

  if (targetSizes.length === 0) {
    log('warn', 'No target sizes specified — will trigger checkout for any available size')
  }

  const tracker = new StockTracker()
  let checkoutTriggered = false

  log('info', `Starting monitor for slug: ${slug}`)
  console.log(`Monitoring ${slug} for sizes: ${targetSizes.length > 0 ? targetSizes.join(', ') : 'any'}`)

  await startPolling(
    slug,
    config,
    async (status) => {
      // Filter to target sizes if specified
      const matchingSizes = targetSizes.length > 0
        ? status.availableSizes.filter((s) => targetSizes.includes(s))
        : status.availableSizes

      const change = tracker.update(matchingSizes)

      log('debug', `Poll result for ${slug}`, {
        details: `transition:${change.transition} sizes:${matchingSizes.join(',')}`,
      })

      if (change.transition === 'became_available' && autoCheckout && !checkoutTriggered) {
        // Guard against race conditions — set flag immediately
        checkoutTriggered = true

        log('info', `Stock detected for ${slug}: ${change.newSizes.join(', ')} — triggering checkout`)
        console.log(`\n✓ Stock detected! Available sizes: ${change.newSizes.join(', ')} — triggering checkout...`)

        try {
          const summary = await runParallelCheckout({
            productUrl,
            targetSizes: change.newSizes.length > 0 ? change.newSizes : matchingSizes,
            dryRun,
            configPath,
            selectorsPath,
          })

          printCheckoutSummary(
            summary.results.map((r) => ({
              accountEmail: r.accountEmail,
              finalOutcome: r.finalOutcome,
              steps: r.steps,
              durationMs: r.durationMs,
            })),
            dryRun,
          )

          const hasSuccess = summary.results.some(
            (r) => r.finalOutcome === 'success' || r.finalOutcome === '3ds_success',
          )

          if (hasSuccess) {
            log('info', `Checkout succeeded for ${slug} — stopping monitor`)
            controller.abort()
          } else {
            // Allow retry on next stock detection
            checkoutTriggered = false
          }
        } catch (err) {
          log('error', `Checkout failed for ${slug}: ${err}`)
          checkoutTriggered = false
        }
      }
    },
    controller.signal,
  )
}
