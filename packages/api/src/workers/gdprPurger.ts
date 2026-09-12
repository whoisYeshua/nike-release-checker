/**
 * GDPR Hard-Purge Worker — Story 16.5, Task 4
 *
 * Runs hourly. Finds customers whose deleted_at is older than 30 days and
 * permanently removes them (the customer row and cascading child rows).
 *
 * Before deleting the customer row, `dek_wrapped` is scrambled with random bytes
 * so any DB backup taken after hard-purge cannot decrypt residual ciphertext.
 */

import { customersDb } from '../db/customers.ts'
import { audit } from '../services/audit.ts'

let _intervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Single tick — exported for unit-test injection of a mock clock.
 */
export async function gdprPurgerTick(now: Date = new Date()): Promise<void> {
  const due = customersDb.findDueForHardPurge(now)
  for (const c of due) {
    // Scramble DEK so backups cannot decrypt residual ciphertext.
    customersDb.scrambleDekWrapped(c.id)

    // Delete customer row — in production this cascades to api_keys, remaining drops, drop_runs.
    customersDb.delete(c.id)

    // Audit the hard-purge event (customer_id becomes null via ON DELETE SET NULL in prod).
    audit.logDirect({
      customerId: null,
      actor: 'system',
      action: 'customer.hard_purge',
      resourceId: c.id,
      extra: { purged_at: now.toISOString() },
    })
  }
}

/**
 * Start the hourly GDPR hard-purge loop.
 * Call `stopGdprPurger()` to cancel (e.g. on app close).
 */
export function startGdprPurger(): void {
  if (_intervalHandle != null) return
  _intervalHandle = setInterval(() => {
    void gdprPurgerTick()
  }, 60 * 60 * 1_000)
  _intervalHandle.unref?.()
}

/** Stop the GDPR hard-purge loop. */
export function stopGdprPurger(): void {
  if (_intervalHandle != null) {
    clearInterval(_intervalHandle)
    _intervalHandle = null
  }
}
