import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import type { StepResult } from '../executeStep.ts'
import { detect3DS, waitFor3DSCompletion } from '../detectors/threeDSDetector.ts'

/**
 * Handle 3DS challenge if present.
 * Returns a StepResult if 3DS was required, or null if not required.
 */
export async function handle3DSIfRequired(
  page: Page,
  selectors: Selectors,
  timeoutMs = 300_000,
): Promise<StepResult | null> {
  const start = performance.now()

  const detection = await detect3DS(page, selectors)
  if (!detection.required || !detection.iframeSelector) {
    return null
  }

  // 3DS is required — wait for user/system to complete it
  const completed = await waitFor3DSCompletion(page, detection.iframeSelector, timeoutMs)

  const durationMs = Math.round(performance.now() - start)

  if (!completed) {
    return {
      step: '3ds-validation',
      outcome: '3ds_timeout',
      durationMs,
      error: `3DS challenge timed out after ${timeoutMs}ms`,
    }
  }

  return {
    step: '3ds-validation',
    outcome: 'success',
    durationMs,
    details: '3ds_completed',
  }
}
