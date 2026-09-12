# Hybrid Pipeline — Canonical 10-Step Ownership Table

| Step | Owner | Source | Story |
|---|---|---|---|
| 1. PDP navigate + size click | DOM | existing `selectSize.ts` | 4.1 / FR69 |
| 2. skuId harvest | DOM/SDK | new `harvestSkuId.ts` | 12.2 (fallback) |
| 3. initVisitor + addItem | API | `NikeCartApi` | 12.1 |
| 4. openShippingView + wait | API | `NikeCartViewsApi` | 12.3 |
| 5. listOfferings + price job | API | `NikeFulfillmentApi` | 12.4 |
| 6. listOptions + bind | API | `NikePaymentApi` | 12.5 |
| 7. Adyen card entry (first-time only) | DOM | existing `completePayment.ts` | 4.5b / FR70 |
| 8. openReview + assertTotalMatches | API | `NikeReviewApi` | 12.6 |
| 9. submit `PUT /buy/checkouts/` | API | `NikeCheckoutsApi` | 12.8 |
| 10. 3DS challenge | DOM | existing handler | FR71 |

## Dry-run cut-line

Dry-run aborts **AFTER Step 8** (review validated, no submit).

The review step (Step 8) MUST run in dry-run mode — it validates the cart total
matches expectations and is the final correctness gate before commit. Skipping it
would defeat the purpose of dry-run.

## Feature flag

`CHECKOUT_PIPELINE` env var or `checkout.pipeline` config key:

- `dom` (default for self-hosted) — v2 DOM steps unchanged
- `hybrid` (default for SaaS, i.e. `bot.tier === 'saas'`) — this table

Default resolution: explicit `pipeline` key wins; else if `tier === 'saas'` use
`hybrid`; else `dom`.
