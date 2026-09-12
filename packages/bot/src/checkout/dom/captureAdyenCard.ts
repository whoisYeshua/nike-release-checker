// captureAdyenCard — wraps the existing completePayment.ts Adyen typing logic.
// Called only when paymentApi.listOptions() returns [] (account has no stored card).
// After successful card capture the card lands in Nike's vault and subsequent runs
// hit the API path entirely.
//
// Story 12.7, FR70. v3.0 reuses v2 selectors as-is (per FR70 acceptance).

import type { Page } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import type { CardData } from '../steps/completePayment.ts'
import { completePayment } from '../steps/completePayment.ts'
import type { StepResult } from '../executeStep.ts'

export interface CaptureAdyenCardArgs {
	page: Page
	selectors: Selectors
	card: CardData
	timeoutMs?: number
}

/**
 * Initiates DOM-based Adyen card entry for first-time card capture.
 * Returns the StepResult from completePayment. On success, the card is vaulted
 * and the caller should re-call paymentApi.listOptions() to pick the newly stored
 * method via the API path.
 */
export const captureAdyenCard = async (
	args: CaptureAdyenCardArgs,
): Promise<StepResult> => {
	return completePayment(args.page, args.selectors, {
		timeoutMs: args.timeoutMs ?? 15_000,
		card: args.card,
	})
}
