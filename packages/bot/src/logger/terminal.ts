import { styleText } from 'node:util'
import type { StepResult } from '../checkout/executeStep.ts'
import { maskEmail } from './credentialMasker.ts'

export interface CheckoutResultDisplay {
  accountEmail: string
  finalOutcome: string
  steps: StepResult[]
  durationMs: number
}

export function printCheckoutHeader(accountEmail: string, dryRun = false): void {
  const maskedEmail = maskEmail(accountEmail)
  const dryRunLabel = dryRun ? styleText('yellow', ' [DRY-RUN]') : ''
  console.log(styleText('bold', `[checkout] Starting pipeline for ${maskedEmail}`) + dryRunLabel)
}

export function printStepResult(result: StepResult): void {
  const isSuccess = result.outcome === 'success'
  const icon = isSuccess ? styleText('green', '✓') : styleText('red', '✗')
  const stepLabel = styleText('cyan', result.step)
  const outcomeLabel = isSuccess
    ? styleText('green', result.outcome)
    : styleText('red', result.outcome)
  const duration = styleText('dim', `${result.durationMs}ms`)
  const details = result.details ? styleText('dim', ` — ${result.details}`) : ''
  const error = result.error ? styleText('red', ` (${result.error})`) : ''
  console.log(`  ${icon} ${stepLabel}: ${outcomeLabel} ${duration}${details}${error}`)
}

export function printCheckoutSummary(
  results: CheckoutResultDisplay[],
  isDryRun = false,
): void {
  const total = results.length
  const successful = results.filter(
    (r) => r.finalOutcome === 'success' || r.finalOutcome === '3ds_success',
  ).length
  const noSession = results.filter((r) => r.finalOutcome === 'no_session').length
  const failed = total - successful - noSession

  console.log('')
  if (isDryRun) {
    console.log(styleText('yellow', '⚠️  DRY-RUN MODE — orders were NOT placed'))
  }
  console.log(styleText('bold', '─── Checkout Summary ───'))
  console.log(`  Total:      ${total}`)
  console.log(`  ${styleText('green', 'Successful')}: ${successful}`)
  console.log(`  ${styleText('red', 'Failed')}:     ${failed}`)
  console.log(`  No session: ${noSession}`)
  console.log('')

  for (const result of results) {
    const email = maskEmail(result.accountEmail)
    const outcome = result.finalOutcome
    const duration = styleText('dim', `${result.durationMs}ms`)

    let statusLabel: string
    if (outcome === 'success' || outcome === '3ds_success') {
      statusLabel = styleText('green', `✓ ${outcome}`)
    } else if (outcome === 'no_session') {
      statusLabel = styleText('dim', `- ${outcome}`)
    } else {
      statusLabel = styleText('red', `✗ ${outcome}`)
    }

    console.log(`  ${email} — ${statusLabel} ${duration}`)

    // Print each step result inline
    for (const step of result.steps) {
      const icon = step.outcome === 'success' ? styleText('green', '  ✓') : styleText('red', '  ✗')
      const stepName = styleText('dim', step.step)
      const stepOutcome = step.outcome === 'success'
        ? styleText('green', step.outcome)
        : styleText('red', step.outcome)
      const err = step.error ? styleText('red', ` — ${step.error}`) : ''
      console.log(`    ${icon} ${stepName}: ${stepOutcome}${err}`)
    }
  }
}
