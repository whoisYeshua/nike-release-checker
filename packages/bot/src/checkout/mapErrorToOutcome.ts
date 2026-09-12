// mapErrorToOutcome — translates a caught pipeline error into a CheckoutPipelineResult
// using the errorToBlockReason taxonomy. Ensures fault isolation: one account failing
// does not block the next (NFR12).
//
// Story 12.7.

import type { StepResult, StepOutcome } from './executeStep.ts'
import { errorToBlockReason } from './api/errorToBlockReason.ts'
import type { BlockReason } from '../outcomes/blockReason.ts'
import type { FinalOutcome } from './outcomeClassifier.ts'

// Map BlockReason → StepOutcome so the existing pipeline result shape is preserved.
const blockReasonToStepOutcome = (reason: BlockReason): StepOutcome => {
	switch (reason) {
		case 'blocked': return 'blocked'
		case 'rate_limited': return 'blocked'
		case 'session_expired': return 'no_session'
		case 'sku_not_available': return 'sold_out'
		case 'style_color_not_found': return 'sold_out'
		case 'view_timeout': return 'timeout'
		case 'fulfillment_timeout': return 'timeout'
		case 'review_timeout': return 'timeout'
		default: return 'error'
	}
}

// Map BlockReason → FinalOutcome for the top-level result.
const blockReasonToFinalOutcome = (reason: BlockReason): FinalOutcome => {
	switch (reason) {
		case 'blocked': return 'blocked'
		case 'rate_limited': return 'blocked'
		case 'session_expired': return 'no_session'
		case 'sku_not_available': return 'sold_out'
		case 'style_color_not_found': return 'sold_out'
		case 'view_timeout': return 'timeout'
		case 'fulfillment_timeout': return 'timeout'
		case 'review_timeout': return 'timeout'
		default: return 'error'
	}
}

export interface PipelineOutcome {
	outcome: FinalOutcome
	steps: StepResult[]
	blockReason: BlockReason
	error: string
}

/**
 * Converts a thrown error + completed steps so far into a typed pipeline outcome.
 * Use this in the top-level catch of hybridPipeline to ensure uniform error reporting.
 */
export const mapErrorToOutcome = (
	e: unknown,
	steps: StepResult[],
): PipelineOutcome => {
	const reason = errorToBlockReason(e)
	const outcome = blockReasonToFinalOutcome(reason)
	const errorMsg = e instanceof Error ? e.message : String(e)

	// Append a synthetic failed step only when the steps array doesn't already
	// capture the failure (avoids double-counting when the step push happened).
	const lastStep = steps[steps.length - 1]
	const stepsWithError: StepResult[] =
		lastStep !== undefined && lastStep.outcome !== 'success'
			? steps
			: [
				...steps,
				{
					step: 'pipeline-error',
					outcome: blockReasonToStepOutcome(reason),
					durationMs: 0,
					error: errorMsg,
				},
			]

	return { outcome, steps: stepsWithError, blockReason: reason, error: errorMsg }
}
