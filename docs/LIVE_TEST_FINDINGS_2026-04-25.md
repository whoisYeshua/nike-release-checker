# Live Browser Test Findings — 2026-04-25

End-to-end validation session against real Nike FR with visible Chrome on `epic/bot-package` after the v1.0/v1.1 swarm.

## Validated

- **Visible Chrome launch.** `nike-bot capture-session --account candid_audio` opens a visible Chrome window using the persistent profile in `~/.nike-bot/profiles/candid_audio/`. The browser stays open until the auth cookie is detected, then captures the session and exits cleanly.
- **Auth handshake.** `[auth] handshake returned: true, page URL: https://www.nike.com/member/profile`. OIDC localStorage entries detected. `sid` cookie confirmed. 19 cookies + 1 localStorage origin + 1 sessionStorage origin captured.
- **Live polling against `api.nike.com/product_feed/threads/v3/` works.** `packages/bot/scripts/live-test-polling.ts` returned 9 raw objects, 7 with available sizes — full FR market.
- **Test glob is now safe.** `npm test` runs unit tests only (146/147 pass). Integration tests that launch real Chromium are isolated under `npm run test:integration` and never fire by default.
- **TypeScript clean.** `tsc --noEmit` returns 0 errors after the consolidation commit `72dd464`.
- **Bundle build works.** `node packages/bot/scripts/bundle.mjs` produces `dist/nike-bot.bundle.js` at 325.4 KB.

## Selector findings — current Nike FR DOM (April 25 2026)

### SNKRS launch pages (`/fr/launch/t/<slug>`)
The product feed surfaces SNKRS-style URLs but ALL pages tested today render a "Date de sortie" announcement layout — no size grid, no ATB button. Even items the feed reports as having available sizes.

```
button[data-qa="size-dropdown"]                              -> 0
[data-testid="pdp-grid-selector-item"]                       -> 0
[data-testid="atb-button"]                                   -> 0
```

The bot's `selectors.yaml#productPage.sizeGrid` was set to `button[data-qa="size-dropdown"]` for SNKRS. Today this element does not exist on any SNKRS-launch URL we hit. SNKRS purchase happens through raffles that are not exposed via DOM clicks.

### Regular product pages (`/fr/t/<slug>/<styleColor>`)
These work as expected with the new selectors committed in this branch:

```
[data-testid="pdp-grid-selector-item"]                       -> 25 (each EU size: "EU 35.5" .. "EU 52.5")
[data-testid="atb-button"]                                   -> 1
button:has-text("Ajouter au panier")                         -> 1
```

`selectors.yaml#productPage` now reads:

```yaml
sizeGrid: '[data-testid="pdp-grid-selector-item"]'
sizeButton: '[data-testid="pdp-grid-selector-item"]:text-is("EU {size}")'
addToCartButton: '[data-testid="atb-button"]'
```

### Open issue — `select-size` step timeout
Even with `checkout.stepTimeoutMs: 25000` in `bot.config.yaml`, the pipeline still hits the 25-second outer timeout on `select-size`. The same page loads + the same selector matches in ~3 seconds via the standalone inspector script (`packages/bot/scripts/inspect-regular-product.ts`).

Diff between the two paths:
- inspector: `goto(url) -> waitForTimeout(2500) -> click cookie consent -> count locator`
- pipeline: `auth handshake on /member/profile -> goto(url) -> assertNotBlocked -> dismissCookieConsent(800) -> waitForSelector(sizeGrid, 10s) -> naturalClick`

Most likely culprits (in order):
1. `assertNotBlocked` retries against block patterns and may be slow on a fully loaded PDP.
2. `waitForSelector` requires the element to be visible. The size grid may render below the fold and the lazy-load trigger does not fire under Playwright control.
3. The pre-step navigation to `/member/profile` for auth handshake puts the tab into a non-PDP state. The subsequent `goto(productUrl)` may trigger different anti-bot heuristics than a cold open.

Recommended next iteration:
- Switch the goto in `selectSize.ts` to `waitUntil: 'load'` (or `'networkidle'`) instead of `'domcontentloaded'`.
- Add a `page.evaluate(() => window.scrollTo(0, 800))` before `waitForSelector` to trigger lazy hydration.
- Skip the auth-handshake page-navigate when the productUrl is on the same origin (cookies already loaded).

## Files added in this session

- `packages/bot/scripts/inspect-product-dom.ts` — generic SNKRS-launch DOM dump.
- `packages/bot/scripts/inspect-regular-product.ts` — generic /fr/t/ DOM dump.
- `packages/bot/scripts/inspect-sizes.ts` — text-content + ARIA dump for size buttons on /fr/t/.

## Production-readiness — current verdict

| Area | Status |
|---|---|
| Visible Chrome | ✅ |
| Session capture | ✅ |
| OIDC auth handshake | ✅ |
| SDK polling layer | ✅ |
| CSV system (Epic 10) | ✅ |
| TUI dashboard (Epic 11) | ✅ — covered by FPS test |
| Wizard `nike-bot init` (9-1) | ✅ |
| Install scripts (9-4) | ✅ — bash -n parse OK |
| SEA build infrastructure (9-2) | ✅ scaffolded — CI-only |
| Chromium auto-installer (9-3) | ✅ |
| Code review pass | ✅ — 1 fix + 9 tier-2 reported in `_bmad-output/code-review-2026-04-25.md` |
| **End-to-end checkout dry-run** | ⚠ blocked at select-size step. Selectors are correct; timing/visibility tuning needed. |

The bot is one step-tuning iteration away from a successful end-to-end dry-run on regular Nike FR products. SNKRS launch URLs are NOT a v1 target — they require raffle-flow integration that is out of scope.
