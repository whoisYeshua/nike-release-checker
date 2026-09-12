# @nike-release-checker/bot

Auto-checkout bot for Nike SNKRS — multi-account, multi-country, KPSDK-aware. Drives the full purchase flow against `api.nike.com` via Playwright + page-context fetch.

## What it does

When a configured drop SKU goes live, the bot:

1. Polls the Nike product feed for the SKU
2. For each authenticated account, in parallel:
   - Selects size from the PDP
   - Calls the cart, cart-views, fulfillment, payment, and review APIs
   - Submits the checkout (or stops at any step in dry-run mode)
3. Reports per-account outcomes (`COP` / `SOLD_OUT` / `BLOCKED` / `ERROR`) live in a TUI dashboard, then writes a CSV report

The cart/checkout chain is API-first (Stories 12.1-12.10): `page.evaluate(() => fetch())` lets Kasada's injected ServiceWorker attach the required `x-kpsdk-cd` proof-of-work, and the OAuth Bearer is read from `localStorage['oidc.user:*'].access_token`.

## Install

Requires **Node.js 24+** (`engines.node: ">=24"`) and Playwright Chromium.

```bash
npm install
npm run install-browser --workspace @nike-release-checker/bot
```

The first run also downloads Playwright browsers automatically.

## Configuration

Three CSV files live at the repo root:

| File | Columns | Purpose |
|------|---------|---------|
| `accounts.csv` | `account_id,email,password,proxy_url,country,preferred_sizes` | One row per Nike account |
| `addresses.csv` | `account_id,firstName,lastName,email,street,city,zip,country,phone` | Shipping address per account |
| `cards.csv` | `account_id,card_number,expiry,cvv,holder_name` | Payment card per account (encrypted on import) |

Drop targets live in `drop.csv`:

| Column | Example |
|--------|---------|
| `sku` | `CW2288-111` |
| `country` | `FR` |
| `accounts_filter` | `all` or `acc1;acc2` |
| `scheduled_at` | `2026-04-26T10:00:00Z` (ISO 8601, optional) |
| `sizes` | `42;42.5;43` (optional, falls back to account preferred_sizes) |

Bot config: `packages/bot/bot.config.yaml` (copy `bot.config.example.yaml` and edit). Selectors: `packages/bot/selectors.yaml` (per-country overrides in `selectors/<CC>.yaml`).

## Quickstart

```bash
# 1. Interactive setup wizard — walks through accounts / addresses / cards / sessions
npx nike-bot init

# 2. Or manual: import CSVs + capture sessions
npx nike-bot import-accounts --file ./accounts.csv
npx nike-bot capture-session --account candid_audio
npx nike-bot accounts          # verify session status

# 3. Test the full pipeline without placing an order
npx nike-bot dry-run --sku CW2288-111 --country FR

# 4. Run a scheduled drop with the live TUI
npx nike-bot run --drops ./drop.csv

# 5. Or wait for an SKU to come live, then auto-checkout
npx nike-bot drop --sku CW2288-111 --country FR
```

## Commands

```text
import-accounts    Import Nike account configurations from a JSON/CSV file
login-all          Authenticate all accounts (or a single one with --account)
logout-all         Delete sessions for all accounts (or a specific one)
capture-session    Open a browser to log in manually, save full session
accounts           List all accounts with their session status
start              Start monitoring + automatic checkout daemon
drop               Wait for an SKU to appear, then immediately checkout
dry-run            Test the full checkout flow without placing an order
checkout           Run the checkout pipeline for all accounts
stop               Stop the running daemon
cards              Manage encrypted payment cards
kpsdk-stats        Print KPSDK token cache statistics
install-browser    Download Playwright Chromium
init               Interactive setup wizard
status             Show daemon status and account session health
run                Execute drops from drop.csv with live TUI dashboard
warmup             Pre-drop countdown + session validation + context pre-launch
```

`--help` on any subcommand shows the full option list.

## Anti-bot strategy

- **Real Chrome via CDP** (not Playwright bundled). `realChrome.ts` spawns desktop Chrome with stealth flags and a non-`HeadlessChrome` user-agent (FR-locale Chrome 147 by default).
- **KPSDK** (Kasada) — the page's injected ServiceWorker handles the proof-of-work transparently. We use `page.evaluate(() => fetch())` so cart/checkout calls go through it. On 403 with fresh `x-kpsdk-ct`, the retry loop (Story 14.3) reloads the page and retries once.
- **Bearer token** — extracted from OIDC localStorage at request time (Story 12.10).
- **Per-account isolation** — separate Chrome processes, separate userDataDir, separate proxy URL.

## Running drops

The `run` command launches a TUI dashboard:

- **Pre-drop warmup** (T-5 → T-0): SKU polling, session validation, browser context pre-launch (per account)
- **Live phase**: per-account status (waiting / running / COP / FAIL / BLOCKED) + global counters (Cops/Failed/InProgress)
- **Post-drop summary**: status breakdown table, duration, report path
- **Retry**: press `[R]` to re-run failed accounts (max 3 attempts), `[O]` to open the report folder, `[Q]` to quit

NFR-friendly: 80-cols compliant, color-blind friendly (icon + color), keyboard-only navigation. `NIKE_BOT_NO_ANIMATIONS=1` disables animations.

## Reporting

Each `run` writes `./reports/report-<timestamp>.csv` with one row per (account, attempt):

```
account_id,sku,size,status,error_reason,duration_ms,retry_attempt
```

`status` ∈ `COP / SOLD_OUT / BLOCKED / THREEDS_TIMEOUT / NO_SESSION / ERROR`.

## Build a binary (SEA)

```bash
# macOS Apple Silicon
./build/build-macos.sh
# → dist/nike-bot-macos-arm64

# Windows x64
pwsh ./build/build-windows.ps1
# → dist/nike-bot-win-x64.exe
```

The bundle is `packages/bot/dist/nike-bot.bundle.js` (~404 KB minified). The SEA wraps it into a self-contained Node 24 binary with embedded code cache.

Linux: not currently scaffolded — repurpose the macOS script with `--platform linux-x64` if needed.

## Architecture

```
packages/bot/src/
├── checkout/
│   ├── api/           — NikeCartApi, CartViewsApi, FulfillmentApi, PaymentApi,
│   │                    ReviewApi, CheckoutsApi (Stories 12.1-12.8 + 12.10)
│   ├── pipelines/     — hybridPipeline orchestrator (Story 12.7)
│   ├── steps/         — DOM steps (selectSize, dismissCookies, …)
│   ├── outcomes/      — BlockReason taxonomy
│   └── retryController.ts
├── stealth/
│   ├── kpsdk/         — KPSDK extractor + cache + retry-on-403 (Epic 14)
│   ├── realChrome.ts  — CDP-based real Chrome launcher
│   └── realCheckoutContext.ts
├── tui/               — Ink dashboard + animations + warmup + summary (Epic 11)
├── country/           — 52-country registry, locale validation, selector overrides (Epic 13)
├── config/            — accountsCsv, addressesCsv, cardsCsv, dropCsv parsers
└── cli/               — Commander-based CLI (`commands.ts`)
```

## Tests

```bash
npm test --workspace @nike-release-checker/bot
# 648 unit tests, 0 failures (current baseline)

npm run typecheck --workspace @nike-release-checker/bot
# 0 errors
```

Live integration tests live under `packages/bot/test/integration/` and are gated behind `RUN_LIVE_TESTS=1` (real Nike account required):

```bash
RUN_LIVE_TESTS=1 \
NIKE_TEST_ACCOUNT=candid_audio \
NIKE_TEST_PDP="https://www.nike.com/fr/t/<slug>/<styleColor>" \
NIKE_TEST_SKU=<skuId> \
NIKE_TEST_SLUG=<slug> \
NIKE_TEST_STYLE_COLOR=<styleColor> \
node --import tsx packages/bot/scripts/live-test-cart-api.ts
```

## Troubleshooting

- **`SessionExpiredError`** — the OIDC token in localStorage is gone or expired. Re-run `nike-bot capture-session --account <id>`.
- **`KpsdkBlockedError` after one retry** — Kasada hard-block; the account needs a cooldown (typically 15-30 min) and possibly a proxy rotation.
- **`ITEM_QUANTITY_LIMIT` on addItem** — Nike server-side rate limit per SKU per account; the cart already holds the maximum quantity. Empty the cart (manually or via a previous `removeItem`) before retrying.
- **Chrome won't start** — run `nike-bot install-browser` to (re)download the Playwright Chromium binary.

## License

ISC.
