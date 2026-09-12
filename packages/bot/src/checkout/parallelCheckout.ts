import { loadStoredAccounts } from '../auth/accountManager.ts'
import { loadBotConfig } from '../config/botConfig.ts'
import { loadSelectors } from '../config/selectors.ts'
import { maskEmail } from '../logger/credentialMasker.ts'
import { printCheckoutSummary } from '../logger/terminal.ts'
import { runCheckoutPipeline, type CheckoutPipelineResult } from './checkoutPipeline.ts'
import type { CardData } from './steps/completePayment.ts'
import type { ShippingAddress } from './steps/completeShipping.ts'
import type { AccountConfig } from '../config/accountSchema.ts'
import { globalBus, type AccountStatus } from '../tui/eventBus.ts'
import type { FinalOutcome } from './outcomeClassifier.ts'
import type { RetryController } from './retryController.ts'

export interface ParallelCheckoutOptions {
  productUrl: string
  targetSizes?: string[]
  dryRun?: boolean
  configPath?: string
  selectorsPath?: string
  /** Override accounts list (useful for testing) */
  accounts?: AccountConfig[]
  /**
   * Pre-launched Playwright contexts produced by the warmup phase (Story 11.3).
   * When provided the checkout pipeline reuses these contexts instead of
   * creating fresh ones, eliminating Playwright bootstrap time at T=0.
   */
  preLaunchedContexts?: Map<string, unknown>
  /**
   * Retry controller — when present, each emitted `accountStatusChanged` event
   * is tagged with the current attempt number so the dashboard can display
   * "(retry 2/3)" in the details column.
   */
  retryController?: RetryController
  /**
   * Custom proxy resolver — when provided, used instead of the default pool
   * lookup so the retry loop can apply per-account rotation policy.
   */
  proxyResolver?: (acc: AccountConfig) => string | null
  /**
   * Per-account payment card (accountId → card). Threaded to completePayment so
   * the order can actually be paid. Without it the payment step has nothing to
   * fill and fails. Built by the CLI after unlocking cards.db.
   */
  cards?: Map<string, CardData>
  /**
   * Per-account shipping address (accountId → address). Used by completeShipping
   * to verify / switch the address. Built by the CLI from addresses.csv.
   */
  addresses?: Map<string, ShippingAddress>
}

export interface ParallelCheckoutSummary {
  total: number
  complete: number
  failed: number
  noSession: number
  results: CheckoutPipelineResult[]
  durationMs: number
}

export async function runParallelCheckout(
  options: ParallelCheckoutOptions,
): Promise<ParallelCheckoutSummary> {
  const summaryStart = performance.now()
  const { productUrl, dryRun = false, configPath, selectorsPath, retryController } = options

  if (dryRun) {
    console.log('⚠️ DRY-RUN MODE — orders will NOT be placed')
  }

  // Load config and selectors
  const config = await loadBotConfig(configPath)
  const selectors = await loadSelectors(selectorsPath)

  // Use provided accounts or load from store (MUST await — loadStoredAccounts is async)
  const accounts = options.accounts ?? await loadStoredAccounts()
  const targetSizes = options.targetSizes ?? config.checkout?.defaultSizes ?? []

  if (accounts.length === 0) {
    console.log('No accounts found. Run nike-bot import-accounts first.')
    return {
      total: 0,
      complete: 0,
      failed: 0,
      noSession: 0,
      results: [],
      durationMs: Math.round(performance.now() - summaryStart),
    }
  }

  console.log(`Running checkout for ${accounts.length} account(s) in parallel...`)

  // Emit initial waiting status for each account so the TUI dashboard
  // can flip the row from pending to waiting once the pipeline starts.
  // When a retryController is present, emit 'retrying' so the dashboard
  // displays the current attempt number in the details column.
  for (const account of accounts) {
    if (retryController) {
      const attempt = retryController.getAttempts(account.id)
      globalBus.emit('accountStatusChanged', {
        accountId: account.id,
        status: { kind: 'retrying', step: 'selectSize', attempt },
      })
    } else {
      globalBus.emit('accountStatusChanged', {
        accountId: account.id,
        status: { kind: 'waiting', step: 'selectSize' },
      })
    }
  }

  // MUST use Promise.allSettled — never Promise.all
  const settled = await Promise.allSettled(
    accounts.map((account) => {
      const card = options.cards?.get(account.id)
      const shippingAddress = options.addresses?.get(account.id)
      return runCheckoutPipeline(account, config, selectors, {
        productUrl,
        targetSizes,
        dryRun,
        ...(card ? { card } : {}),
        ...(shippingAddress ? { shippingAddress } : {}),
      })
    }),
  )

  const results: CheckoutPipelineResult[] = []
  let complete = 0
  let failed = 0
  let noSession = 0

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]!
    const account = accounts[i]!
    const maskedEmail = maskEmail(account.email)

    if (outcome.status === 'fulfilled') {
      const result = outcome.value
      results.push(result)

      if (result.finalOutcome === 'success' || result.finalOutcome === '3ds_success') {
        complete++
        console.log(`  ✓ ${maskedEmail} — ${result.finalOutcome}`)
      } else if (result.finalOutcome === 'no_session') {
        noSession++
        console.log(`  - ${maskedEmail} — no session`)
      } else {
        failed++
        const lastStep = result.steps[result.steps.length - 1]
        console.log(`  ✗ ${maskedEmail} — ${result.finalOutcome}${lastStep?.error ? ` (${lastStep.error})` : ''}`)
      }
      // Emit per-step events so the TUI can show granular progress per account.
      for (const step of result.steps) {
        globalBus.emit('stepCompleted', {
          accountId: account.id,
          step: step.step,
          durationMs: step.durationMs,
        })
      }
      globalBus.emit('accountStatusChanged', {
        accountId: account.id,
        status: finalOutcomeToStatus(result.finalOutcome, targetSizes),
      })
    } else {
      failed++
      const fakeResult: CheckoutPipelineResult = {
        accountId: account.id,
        accountEmail: maskedEmail,
        steps: [],
        finalOutcome: 'error',
        durationMs: 0,
      }
      results.push(fakeResult)
      console.log(`  ✗ ${maskedEmail} — pipeline threw: ${String(outcome.reason)}`)
      globalBus.emit('accountStatusChanged', {
        accountId: account.id,
        status: { kind: 'fail', reason: 'ERROR' },
      })
    }
  }

  globalBus.emit('checkoutFinished', {
    totalAccounts: accounts.length,
    cops: complete,
    failures: failed,
  })

  const durationMs = Math.round(performance.now() - summaryStart)
  const summary: ParallelCheckoutSummary = {
    total: accounts.length,
    complete,
    failed,
    noSession,
    results,
    durationMs,
  }

  printCheckoutSummary(
    results.map((r) => ({
      accountEmail: r.accountEmail,
      finalOutcome: r.finalOutcome,
      steps: r.steps,
      durationMs: r.durationMs,
    })),
    dryRun,
  )

  return summary
}

function finalOutcomeToStatus(outcome: FinalOutcome, targetSizes: string[]): AccountStatus {
  switch (outcome) {
    case 'success':
    case '3ds_success':
      return { kind: 'cop', size: targetSizes[0] ?? '' }
    case 'sold_out':
      return { kind: 'fail', reason: 'SOLD_OUT' }
    case 'blocked':
      return { kind: 'fail', reason: 'BLOCKED' }
    case '3ds_timeout':
      return { kind: 'fail', reason: 'THREEDS_TIMEOUT' }
    case 'no_session':
    case 'timeout':
    case 'error':
    default:
      return { kind: 'fail', reason: 'ERROR' }
  }
}
