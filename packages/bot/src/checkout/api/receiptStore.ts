// receiptStore — persists a checkout receipt to .bot-data/receipts/<accountId>-<orderNumber>.json
// after a successful submit. File mode 0o600 (owner-read/write only) per NFR7.
//
// The receipt intentionally omits PII fields (shipping address, card last4) — only
// the auditable transaction signal is stored (orderNumber, orderId, totals, status).
//
// Phase 5 (Story 16.x) promotes receipts to the multi-tenant Postgres `orders` table.
// Story 12.8, FR65.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CheckoutResponse } from './checkoutsApi.types.ts'

export interface Receipt {
	accountId: string
	cartId: string
	orderNumber: string
	orderId: string
	status: string
	totalAmount?: number
	currency?: string
	etaWindow?: { earliest: string; latest: string }
	receiptUrl?: string
	capturedAt: string
}

/**
 * Sanitises a raw account/order identifier for safe use in file names.
 * Replaces any character that is not alphanumeric, underscore, or hyphen
 * (e.g. `@`, `.`) with `_` to avoid directory traversal and filesystem issues.
 */
const sanitise = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '_')

/**
 * Writes a PII-redacted receipt JSON to `<root>/.bot-data/receipts/<accountId>-<orderNumber>.json`.
 * Creates intermediate directories as needed.
 * Returns the absolute path of the written file.
 */
export const persistReceipt = async (
	root: string,
	accountId: string,
	cartId: string,
	resp: CheckoutResponse,
): Promise<string> => {
	const safeAccountId = sanitise(accountId)
	const safeOrderNumber = sanitise(resp.orderNumber)
	const path = join(root, '.bot-data', 'receipts', `${safeAccountId}-${safeOrderNumber}.json`)
	await mkdir(dirname(path), { recursive: true })

	const receipt: Receipt = {
		accountId,
		cartId,
		orderNumber: resp.orderNumber,
		orderId: resp.orderId,
		status: resp.status,
		totalAmount: resp.totalAmount,
		currency: resp.currency,
		etaWindow: resp.etaWindow,
		receiptUrl: resp.receiptUrl,
		capturedAt: new Date().toISOString(),
	}

	await writeFile(path, JSON.stringify(receipt, null, 2), { mode: 0o600 })
	return path
}
