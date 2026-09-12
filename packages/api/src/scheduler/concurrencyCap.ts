// Per-customer concurrency cap — Story 17.2
// Checks how many drops are ACTIVE for a customer and whether promotion is allowed.

import type { Tier } from '../services/customerTier.ts'
import { getTier } from '../services/customerTier.ts'
import { dropsDb } from '../db/drops.ts'

export interface ConcurrencyCapResult {
  allowed: boolean
  current: number
  max: number | null
}

// Hard-coded tier caps for v3.1.
// In v3.2, these move into subscription_tiers Stripe metadata (Story 18.2).
const TIER_CAPS: Record<Tier, number | null> = {
  solo: 1,
  pro: 5,
  enterprise: null,
} as const

/**
 * Returns whether a customer can promote another drop to ACTIVE.
 *
 * - Queries the in-memory drops store for active count.
 * - Looks up the customer tier via customerTier service.
 * - `max=null` means unlimited (enterprise).
 */
export async function canPromoteToActive(
  customerId: string,
): Promise<ConcurrencyCapResult> {
  const tier = await getTier(customerId)
  const max = TIER_CAPS[tier]

  // Count drops currently in ACTIVE state for this customer
  const current = dropsDb.countActive(customerId)

  const allowed = max === null ? true : current < max

  return { allowed, current, max }
}
