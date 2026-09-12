// KpsdkClient interface contract for Story 12.9.
// The actual implementation lands in Epic 14 (Story 14.1).
// This story ships a stub for injection in unit tests and as a default fallback.

import type { Page } from 'playwright'

export interface KpsdkClient {
	/** Performs a silent page reload to re-bootstrap the KPSDK token. */
	refresh(page: Page): Promise<void>
	/** Returns the current KPSDK token pair, or null if not yet bootstrapped. */
	currentToken(): { ct: string; v: string } | null
}

/**
 * Stub implementation — falls back to a plain page.reload() until Epic 14
 * ships the real KPSDK token extractor (Story 14.1).
 */
export const stubKpsdkClient: KpsdkClient = {
	async refresh(page: Page): Promise<void> {
		await page.reload({ waitUntil: 'networkidle' })
	},
	currentToken(): { ct: string; v: string } | null {
		return null
	},
}
