import type { CheckoutPipelineResult } from './checkoutPipeline.ts'
import type { CheckoutResult } from '../tui/SummaryScreen.tsx'

/**
 * Map a pipeline `finalOutcome` (see outcomeClassifier.ts) to the flat
 * `ReportStatus` enum the SummaryScreen / report writer expects.
 *
 * Keep this map exhaustive and conservative: any unknown / unmapped value
 * collapses to `'ERROR'` so the user is never shown "COP" for a failure.
 */
const OUTCOME_MAP: Record<string, CheckoutResult['status']> = {
	success: 'COP',
	'3ds_success': 'COP',
	sold_out: 'SOLD_OUT',
	blocked: 'BLOCKED',
	'3ds_timeout': 'THREEDS_TIMEOUT',
	no_session: 'NO_SESSION',
	timeout: 'ERROR',
	error: 'ERROR',
	unknown: 'ERROR',
}

/**
 * Extract the picked size from a `select-size` step's `details` field.
 * Production format (see steps/selectSize.ts): `"size:42"` — a single
 * `key:value` pair. We also accept "size: 42" / "Size 42" as a defensive
 * fallback in case future steps tweak the format.
 */
function extractSize(details: string | undefined): string | undefined {
	if (!details) return undefined
	const m = details.match(/size[:\s]+(\S+)/i)
	return m?.[1]
}

/**
 * Adapter — convert a `CheckoutPipelineResult` (rich, step-by-step record
 * produced by `runCheckoutPipeline`) into the flat `CheckoutResult` shape
 * the `SummaryScreen` / `RetrySelection` TUI components consume.
 *
 * The mapping is deterministic and side-effect free; it does NOT touch the
 * filesystem. Error reasons surface from the first non-success step so the
 * report attributes the failure to the actual point of breakdown.
 */
export function toCheckoutResult(
	p: CheckoutPipelineResult,
	sku: string,
	name?: string,
): CheckoutResult {
	const status = OUTCOME_MAP[p.finalOutcome] ?? 'ERROR'

	// Step name is `'select-size'` (with dash) in the production code.
	const sizeStep = p.steps.find(
		(s) => s.step === 'select-size' && s.outcome === 'success',
	)
	const size = extractSize(sizeStep?.details)

	const failedStep = p.steps.find((s) => s.outcome !== 'success')
	const errorReason =
		status !== 'COP'
			? failedStep?.error ?? failedStep?.details ?? p.finalOutcome
			: undefined

	return {
		accountId: p.accountId,
		status,
		sku,
		...(name ? { name } : {}),
		...(size !== undefined ? { size } : {}),
		// CheckoutPipelineResult doesn't currently surface order numbers; leave
		// undefined — SummaryScreen tolerates missing values via optional fields.
		orderNumber: undefined,
		...(errorReason !== undefined ? { errorReason } : {}),
		durationMs: p.durationMs,
	}
}
