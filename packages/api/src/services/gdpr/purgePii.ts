/**
 * GDPR PII Purge — Story 16.5, Task 3
 *
 * Immediately removes / anonymizes all PII-bearing data for a customer within
 * 24 h of a `DELETE /v1/account` request (NFR33).
 *
 * This does NOT remove the customer row itself — that is the hard-purge job
 * (gdprPurger.ts, Task 4) scheduled at now() + 30 days.
 */

import { cardsDb } from '../../db/cards.ts'
import { nikeAccountsDb } from '../../db/nikeAccounts.ts'
import { webhooksDb } from '../../db/webhooks.ts'
import { dropsDb } from '../../db/drops.ts'
import { audit } from '../audit.ts'
import { invalidateDek } from '../../crypto/dekCache.ts'

/**
 * Purge all PII-bearing rows for `customerId`.
 *
 * Steps:
 *  1. Hard-delete cards, Nike accounts, webhooks (and their deliveries in prod via CASCADE).
 *  2. Anonymize drops (clear payment_method_id) and orders (null customer_id).
 *  3. Redact audit log payload JSON for this customer.
 *  4. Zeroize the DEK cache entry.
 *
 * The `customers` row itself is NOT deleted here — hard-purge handles that at T+30d.
 */
export async function purgePii(customerId: string): Promise<void> {
  // 1. Hard-delete entire PII-bearing tables for this customer
  cardsDb.deleteByCustomer(customerId)
  nikeAccountsDb.deleteByCustomer(customerId)
  webhooksDb.deleteByCustomer(customerId)
  // (In production, webhooks CASCADE-deletes webhook_deliveries.)

  // 2. Anonymize drop/order rows (keep IDs for audit trail)
  dropsDb.anonymizeByCustomer(customerId)
  dropsDb.anonymizeOrdersByCustomer(customerId)

  // 3. Redact audit log payloads
  audit.redactCustomerPayloads(customerId)

  // 4. Zeroize DEK cache entry
  invalidateDek(customerId)
}
