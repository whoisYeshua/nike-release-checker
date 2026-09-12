// packages/bot/src/checkout/executeStep.ts

export type StepOutcome =
  | 'success'
  | 'sold_out'
  | 'blocked'
  | '3ds_required'
  | '3ds_timeout'
  | 'timeout'
  | 'no_session'
  | 'error'

export interface StepResult {
  step: string
  outcome: StepOutcome
  durationMs: number
  details?: string
  error?: string
}

export async function executeStep(
  stepName: string,
  fn: () => Promise<string | undefined>,
  timeoutMs = 8000,
): Promise<StepResult> {
  const start = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const details = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error(`Timeout after ${timeoutMs}ms`), { code: 'TIMEOUT' })),
          timeoutMs,
        )
      }),
    ])
    return {
      step: stepName,
      outcome: 'success',
      durationMs: Math.round(performance.now() - start),
      details,
    }
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start)
    const code = (err as { code?: string }).code
    // Playwright's own waitForSelector/goto timeout throws a TimeoutError with no .code property.
    // Detect it explicitly so it's classified as 'timeout' rather than 'error'.
    const isPlaywrightTimeout = err instanceof Error && err.name === 'TimeoutError'
    const outcome: StepOutcome =
      code === 'SOLD_OUT'     ? 'sold_out'     :
      code === 'BLOCKED'      ? 'blocked'      :
      code === '3DS_REQUIRED' ? '3ds_required' :
      code === '3DS_TIMEOUT'  ? '3ds_timeout'  :
      code === 'NO_SESSION'   ? 'no_session'   :
      code === 'TIMEOUT'      ? 'timeout'      :
      isPlaywrightTimeout     ? 'timeout'      :
      'error'
    return {
      step: stepName,
      outcome,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
