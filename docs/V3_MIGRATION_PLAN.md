# V3 Migration Plan — API-first Multi-country SaaS

**Owner:** Jopad
**Drafted:** 2026-04-25
**Status:** Phase 0 complete (planning artifacts updated). Phase 1 ready to start.

This document is the concrete playbook for migrating nike-release-checker from the v1/v2 DOM-driven local CLI to the v3 API-first multi-country B2B SaaS architecture. Companion documents:

- `_bmad-output/planning-artifacts/prd.md` — v3 PRD (FR56-FR75, NFR29-NFR40, business model)
- `_bmad-output/planning-artifacts/epics.md` — Epic 12-18 story skeletons
- `_bmad-output/planning-artifacts/architecture.md` — v3 system topology, data model, security
- `docs/NIKE_API_REFERENCE.md` — load-bearing artifact, full Nike API surface captured live
- `docs/LIVE_TEST_FINDINGS_2026-04-25.md` — what works / doesn't from the v2 live test

The plan is sequenced into 6 phases. Each phase has explicit deliverables, acceptance criteria, and a risk register. Phase boundaries are gate reviews — a phase is not "done" until its acceptance criteria pass on real Nike infrastructure.

---

## Phase 0 — Planning Artifacts (this session)

**Status:** complete on commit of this PR.

### Deliverables

- v3 PRD section added to `_bmad-output/planning-artifacts/prd.md` (FR56-FR75, NFR29-NFR40, personas Sarah + Maxime, business model, version history).
- Epics 12-18 added to `_bmad-output/planning-artifacts/epics.md` with story skeletons + build sequence.
- v3 Architecture Overview added to `_bmad-output/planning-artifacts/architecture.md` (topology, migration plan, multi-country abstraction, multi-tenant data model, worker pool, security).
- This document.

### Acceptance Criteria

- All four documents reference each other correctly.
- v1 and v2 content preserved verbatim under "v1/v2 baseline" sections.
- v3 FR/NFR IDs do not collide with v2.
- One atomic commit on `epic/bot-package`.

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Future implementer reads v2 section first and is confused about which tier governs | Medium | Low | Version History block at top of each doc explicitly disambiguates self-hosted vs SaaS tier. |

---

## Phase 1 — `cartApi.ts` + Live Integration Tests against Nike FR (1 week)

**Goal:** Prove the API-first cart can be initialized and items added from a live, KPSDK-bootstrapped browser context.

### Deliverables

- `packages/bot/src/checkout/api/cartApi.ts` with `initVisitor`, `addItem`, `getCart`, `removeItem` methods. Wraps `page.request.fetch()` so the call inherits cookies + KPSDK token.
- `packages/bot/src/checkout/api/kpsdkClient.ts` (skeleton from Epic 14) — auto-injects `x-kpsdk-ct/-v` headers and exposes `refresh()`.
- `packages/bot/src/checkout/api/cartApi.types.ts` — Cart, CartItem, JsonPatchOp types matching observed shape.
- `packages/bot/scripts/live-test-cart-api.ts` — integration script that:
  1. Launches real Chrome with persisted profile of a known account.
  2. Navigates to a known in-stock product PDP to bootstrap KPSDK.
  3. Calls `initVisitor` then `addItem` for a known SKU/size.
  4. Calls `getCart` and asserts the item is present with correct totals.
- `packages/bot/test/integration/cartApi.live.test.ts` — gated under `npm run test:integration:live` (never default).
- Updated `docs/NIKE_API_REFERENCE.md` if any field shape diverges from the captured baseline.

### Acceptance Criteria

- Live integration test passes on Nike FR with at least one known account, at least 5 consecutive runs without 403.
- p95 latency for `initVisitor + addItem` < 2 s (NFR30 baseline).
- KPSDK refresh-on-403 path exercised at least once and demonstrated to succeed (manually invalidate cached token, observe one retry).
- Unit tests for JSON Patch body construction at 100 % branch coverage.

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| KPSDK token rotation invalidates cache faster than expected | Medium | High | Instrument cache TTL via response header inspection. If TTL < 5 min, switch to per-request token capture. |
| `page.request.fetch` does not actually inherit KPSDK fingerprint as the API ref claims | Low | Critical | Spike script first; if blocked, fall back to `route.fetch()` interception + manual header copy. |
| Nike changes the JSON Patch body format | Low | High | Live integration test catches it within minutes of running. Selector-equivalent risk we already absorb in v2. |

---

## Phase 2 — Migrate addToCart / navigateCheckout / completeShipping to API; keep DOM for size + Adyen + 3DS (1 week)

**Goal:** Half-migrate the v2 pipeline. Size selection stays DOM (FR69), then ATC and shipping are API. Adyen card entry and 3DS still DOM. Submit is still DOM until Phase 3.

### Deliverables

- `packages/bot/src/checkout/steps/addToCart.ts` rewritten to call `cartApi.addItem()` after harvesting `skuId` from the DOM hydration state (`window.__NEXT_DATA__` or equivalent).
- `packages/bot/src/checkout/steps/completeShipping.ts` rewritten to call `cartViewsApi.writeShipping()` (new module).
- `packages/bot/src/checkout/api/cartViewsApi.ts` and `fulfillmentApi.ts` (Stories 12.3, 12.4).
- `packages/bot/src/checkout/steps/navigateCheckout.ts` deleted (no DOM equivalent needed).
- Pipeline orchestrator updated to skip the deleted step.
- Live dry-run script that runs the hybrid pipeline end-to-end against a real account, stopping before Adyen card entry.

### Acceptance Criteria

- Hybrid dry-run completes in < 10 s end-to-end (size click + ATC API + shipping API + fulfillment poll).
- v2 self-hosted tier remains buildable via a feature flag (`CHECKOUT_PIPELINE=dom` falls back to v2 path; `CHECKOUT_PIPELINE=hybrid` runs the new path). Default for self-hosted = `dom`; default for SaaS = `hybrid`.
- All v2 unit tests still pass.
- Per-account fault isolation (NFR12) preserved — verified by parallel-3-accounts integration test.

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| skuId harvesting from `__NEXT_DATA__` breaks when Nike changes hydration shape | Medium | Medium | Fall back to size-grid attribute extraction. Both paths covered by integration test. |
| `cart_views` PUT requires fields we haven't observed (e.g., session-bound nonce) | Medium | High | Sniff full request from a real user checkout via `sniff-api-flow.ts` before writing the wrapper. |
| Feature flag drift makes self-hosted CI red | Low | Medium | Both flag values exercised in CI matrix. |

---

## Phase 3 — Multi-country: replicate FR pipeline against US, UK, DE; abstract per-country deltas (2 weeks)

**Goal:** Prove the API path is genuinely country-parametric. Ship `Country` registry covering FR + US + UK + DE.

### Deliverables

- `packages/bot/src/country/registry.ts` and per-country entries (Story 13.1, 13.4).
- `selectors/{FR,US,UK,DE}.yaml` files with per-country DOM overrides for the residual surfaces (size click selector variants, Adyen iframe locale).
- Per-country phone + ZIP validators (Story 13.3).
- `packages/bot/scripts/live-test-cart-api-multicountry.ts` — runs Phase 1's smoke test against FR, US, UK, DE accounts in sequence.
- Updated v2 CSV loaders to accept any FR/US/UK/DE country and validate phone/zip per registry.

### Acceptance Criteria

- Hybrid dry-run (Phase 2 path) succeeds against at least one account in each of FR, US, UK, DE on real Nike.
- All four countries' p95 cart-init latency < 2 s (NFR30).
- Per-country phone/zip validators have unit tests covering at least 5 valid + 5 invalid samples per country.
- Documentation: `docs/MULTICOUNTRY_NOTES.md` summarizing per-country deltas observed in the wild (e.g., US uses `state` field, UK doesn't; DE has different Adyen iframe locale).

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| US checkout requires a `state` field absent from FR address shape | High | Medium | Country-conditional address payload assembly. Already anticipated in Address schema. |
| Some countries gate behind a `marketplace`-level KPSDK variant we haven't seen | Medium | High | Spike per-country before committing to v3.1 launch. Adjust Epic 14 scope if needed. |
| Procuring real US/UK/DE accounts + residential proxies takes longer than 2 weeks | Medium | Medium | Start procurement during Phase 1. Use partner accounts where available. |

---

## Phase 4 — B2B alpha: REST API for `addDrop` / `runDrop` / `getOrder`, single-tenant first (3 weeks)

**Goal:** Stand up the REST gateway with a SINGLE customer (us, dogfooding). No multi-tenancy yet, no Stripe, no webhooks. Just prove the gateway → drop scheduler → worker pool → API checkout chain.

### Deliverables

- Fastify gateway (Story 15.1) with bearer-token auth (single hardcoded token in `.env`).
- `POST /v1/drops`, `POST /v1/drops/{id}/run`, `GET /v1/drops/{id}`, `GET /v1/orders` endpoints (Stories 15.2, 15.3 partial).
- `Drop` entity + lifecycle state machine (Story 17.1).
- Drop scheduler worker (Story 17.3) — single-process, in-memory queue.
- Worker pool stub: 1 node, 5 Chrome contexts, runs the Phase 3 hybrid pipeline.
- Postgres schema deployed for `drops`, `drop_runs`, `orders` only (account vault deferred to Phase 5).
- OpenAPI 3.1 spec generated.
- Internal customer dashboard (curl scripts only — no UI).

### Acceptance Criteria

- End-to-end: `curl POST /v1/drops` → `curl POST /v1/drops/{id}/run` → wait → `curl GET /v1/drops/{id}` shows COP with Nike orderNumber.
- One real cop on a real Nike drop via the REST path.
- Sub-30 s from `runDrop` API call to Nike orderNumber returned (matches v2 NFR1).
- 5 parallel accounts dispatched correctly (NFR31 baseline at smaller scale).

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| In-memory queue loses drops on crash | High | High | Acceptable for alpha (single dogfood customer). Phase 5 promotes to durable queue. |
| Worker pool of 1 node cannot test scaling assumptions | High | Medium | Defer scaling validation to Phase 5. Phase 4 focus is correctness. |
| Real cop requires real card → real money → bookkeeping mess | Medium | Low | Use a test card pre-funded with a small balance. Refund flow documented. |

---

## Phase 5 — Multi-tenant + billing (4 weeks)

**Goal:** Promote alpha to multi-tenant production. Add Stripe billing, per-customer DEK encryption, webhook delivery, rate-limiting, audit log.

### Deliverables

- Multi-tenant Postgres schema fully deployed (all Epic 16 tables).
- Per-customer DEK derivation via cloud KMS (Story 16.1).
- Account credentials + cards encrypted at rest (Stories 16.2, 16.3).
- Cross-tenant isolation integration test in CI (Story 16.4) — must be green to merge anything.
- `POST /v1/accounts` endpoint accepting Nike credentials, encrypting before storage.
- Stripe Customer + Subscription provisioning (Story 18.1).
- Per-cop usage event emission with idempotency key (Story 18.2).
- Stripe webhook receiver with idempotent processing (Story 18.3).
- Webhook outbox + delivery worker (Story 15.5) — HMAC-SHA256, exp-backoff, DLQ.
- Per-tier rate-limiting middleware (Story 15.4).
- Audit log table + write-through on all mutating endpoints (NFR39).
- Worker pool auto-scaling (target 2-5 nodes, 50 contexts each = 100-250 parallel accounts).
- Customer self-serve API key generation + rotation.
- GDPR delete-my-data + DEK rotation endpoints (Story 16.5).

### Acceptance Criteria

- 3 paying customers (or internal proxies acting as 3 distinct customers) running concurrent drops without cross-pollution. Cross-tenant isolation test green in CI.
- 1 successful cop billed end-to-end through Stripe with metered usage event recorded.
- Webhook delivery: at least one customer receives a `drop.cop` webhook within 30 s of cop (NFR37).
- Rate-limiting verified: a Solo-tier key is throttled to 60 req/min and returns 429 with `Retry-After`.
- API availability ≥ 99.5 % over a 7-day soak test (NFR36).
- 50 parallel checkouts on a single worker node sustained without NFR30 degradation (NFR31).
- Stripe webhook idempotency verified by replaying an `event.id` and asserting no double-charge (NFR40).
- GDPR delete flow purges PII within 24 h (NFR33).

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| KMS DEK retrieval latency adds tail latency to checkout | Medium | Medium | Cache DEK per worker process for the duration of a drop run. Rotate cache on DEK rotation event. |
| Stripe webhook delivery delays cause billing reconciliation drift | Low | Medium | Audit log + nightly reconciliation job catches drift within 24 h. |
| 50 parallel Chrome contexts on one node OOM | High | High | Capacity test in Phase 5 dry-run. If OOM, reduce M to 30 and scale horizontally earlier. Also explore Chrome `--memory-pressure-off` and per-context profile slimming. |
| Cross-tenant data leak via shared Redis KPSDK cache | Low | Critical | Cache key = `customer_id:nike_account_id`, never `nike_account_id` alone. Code review checklist item. |
| First real customer hits production bugs we missed in dogfood | High | Medium | Stage Phase 5 launch behind a closed beta of 5-10 invited customers. Open signups only after 2 weeks of beta-stable operation. |

---

## Cross-cutting concerns (apply to every phase)

### Observability

- Structured logging (NDJSON) extending v1/v2 pattern. New field: `customer_id` on every log line in v3.
- Metrics: per-endpoint latency p50/p95/p99, Kasada block rate, worker node CPU/memory, Stripe event lag.
- Tracing: per-drop_run trace ID propagated from API gateway through worker pool through Nike API call.

### Security review checkpoints

- After Phase 1: KPSDK token handling review.
- After Phase 2: skuId harvesting + DOM injection surface review.
- After Phase 4: API authentication + rate-limit bypass review.
- Before Phase 5 launch: cross-tenant isolation audit + GDPR readiness audit + Stripe PCI scope assessment (we never touch card numbers — Adyen iframe + Stripe both keep us out of PCI scope, but document the boundary).

### Backwards compatibility

- The v1/v2 self-hosted tier is **never** broken by v3 work. Every commit must keep `npm test` green for the v2 path. The v2 DOM pipeline lives behind `CHECKOUT_PIPELINE=dom` and remains supported indefinitely.
- Sub-rule: v3 changes that touch shared modules (logger, config, country registry) must include a test asserting v2 behaviour is unchanged.

### Documentation

- Phase 1: `cartApi.ts` JSDoc + integration test as living documentation.
- Phase 3: `docs/MULTICOUNTRY_NOTES.md`.
- Phase 4: OpenAPI 3.1 spec auto-generated; published to `https://api.<our-domain>/docs`.
- Phase 5: Customer-facing docs site (`/v1/quickstart`, `/v1/accounts`, `/v1/drops`, `/v1/webhooks`, `/v1/billing`).

---

## Phase exit gates summary

| Phase | Exit Gate | Owner |
|-------|-----------|-------|
| 0 | This commit lands | Jopad |
| 1 | 5 consecutive successful live cart-init runs against Nike FR | Jopad |
| 2 | Hybrid pipeline dry-run < 10 s, all v2 tests still green | Jopad |
| 3 | Hybrid dry-run succeeds in 4 countries; multi-country docs published | Jopad |
| 4 | 1 real cop via REST API end-to-end | Jopad |
| 5 | 3 paying customers concurrent, NFR29-NFR40 all green over 7-day soak | Jopad + first hire |

After Phase 5: v3 is GA. v4 (Telegram bot, web dashboard, mobile app) is a separate planning cycle.
