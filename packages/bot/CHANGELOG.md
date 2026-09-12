# @nike-release-checker/bot

## 0.1.0

Initial v3 SaaS-ready release. The bot transitions from a DOM-only checkout flow
to a hybrid DOM + JSON-API pipeline that bypasses Kasada (KPSDK) by routing
all `api.nike.com` calls through `page.evaluate(() => fetch())`.

### Epic 12 — API-first cart & checkout

- `NikeCartApi`: initVisitor / addItem / getCart / removeItem / setQuantity
  with the live-discovered Nike contract (path:'/items', value:{id} on remove,
  value:{id, skuId, quantity} on replace).
- `NikeCartViewsApi`: openShippingView / waitForView / mergeView.
- `NikeFulfillmentApi`: listOfferings / pollPricingJob / pickDefaultOffering
  (SHIP > PICKUP, cheapest cost).
- `NikePaymentApi`: listOptions / bindPaymentMethod / pickDefaultPaymentMethod.
- `NikeReviewApi`: openReview / waitForReview / assertTotalMatches.
- `NikeCheckoutsApi`: PUT /buy/checkouts/<cartId> (final submit) +
  receiptStore (mode 0o600, PII-redacted).
- `hybridPipeline`: 10-step orchestrator wrapped in `withApiRetry`.
- `withApiRetry` + typed errors (`KpsdkBlockedError`, `RateLimitedError`,
  `ServerError`, `SessionExpiredError`).
- Cart transport pivot: `page.evaluate(() => fetch())` so Kasada's
  ServiceWorker attaches `x-kpsdk-cd` POW. Bearer extracted from
  `localStorage['oidc.user:*'].access_token`.

### Epic 13 — Multi-country (52 markets)

- Country registry sourced from `@nike-release-checker/sdk` `availableCountries`.
- 10 explicit overrides (FR/US/GB/DE/JP/ES/IT/NL/BE/AU) with validated phone
  + zip patterns; the other 42 use generic E.164 / open zip + per-region
  currency / phone-prefix lookup.
- Per-country cart endpoints + URL prefix (`addItem` derives locale from
  `country.languageCode`).
- Locale validation (`validatePhone` / `validateZip` + valibot schemas).
- Per-country selector overrides (`selectors/<CC>.yaml` deep-merged on top
  of `selectors.yaml`, LRU-cached).
- Multi-country drop CSV with country-scoped accounts_filter + `enabled`
  guard.

### Epic 14 — KPSDK

- `KpsdkExtractor` (page-attached, WeakMap-keyed).
- `KpsdkCache` with TTL per (accountId, country).
- `RealKpsdkClient` retry-on-403/409 (cache invalidate → reload page →
  re-extract).

### Epic 11 — TUI

- Ink dashboard with ~10 FPS render rate, NFR27 80-cols compliance.
- Spinner / FadeHighlight / CountAnimation primitives + hard off-switch
  (`NIKE_BOT_NO_ANIMATIONS=1`).
- Pre-drop warmup widget (T-5 → T-0 phased timeline).
- Final summary screen with status breakdown + report path + R/O/Q menu.
- Retry-failed-accounts flow with checkbox selection + retryController
  (max 3 attempts).

### Epic 16 — Account vault (Postgres + KMS) — wired into the api package

(Schema, KMS interfaces, encryption utilities, GDPR delete cascade —
shipped in `packages/api/`.)

### Epic 17 — Drop-as-a-Service — wired into the api package

(8-state lifecycle, scheduler, run isolation, WS event stream, warmup
coordinator — shipped in `packages/api/`.)

### Tests

- 648 unit tests (`node --test`), 0 failures, 0 tsc errors.
- 1 live integration test gated behind `RUN_LIVE_TESTS=1` against real
  Nike FR — validated end-to-end (initVisitor + getCart 200, KPSDK POW
  signed, Bearer injected).

### Known limitations

- Stripe billing (Epic 18) intentionally not implemented — payments are
  not enabled in this release.
- The 42 SDK-generated countries use generic phone / zip patterns;
  10 explicit countries have validated patterns.
- Linux SEA build not scaffolded (macOS arm64 + Windows x64 only).
