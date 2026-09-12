# Nike FR API Reference — captured 2026-04-25

Live network trace of `PDP → ATC → cart → checkout` flow, captured via `packages/bot/scripts/sniff-api-flow.ts` against `https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-homme-jBrhdR/CW2288-111` with an authenticated session (sid cookie).

Foundation for an API-first checkout layer (B2B "cop-as-a-service" target).

## Anti-bot — KPSDK (Kasada)

The PDP page declares which endpoints require a Kasada token via a `KPSDK.configure([...])` block. Any request to those endpoints MUST carry a valid `x-kpsdk-ct` + `x-kpsdk-v` header pair. The token is set per-page-load by an obfuscated `p.js` script served from `nike.com/<uuid>/<uuid>/p.js`.

**Protected endpoints (from KPSDK.configure):**

| Method | Path |
|---|---|
| POST | `/cic/grand/*` |
| POST | `/launch/entries/v2` (and v3) |
| PUT | `/buy/checkouts/*` |
| PUT | `/buy/partner_cart_preorder/*` |
| PATCH | `/buy/carts/v2/*/NIKE/NIKECOM` |
| PUT | `/buy/carts/v2/*/NIKE/NIKECOM` |
| POST | `/buy/cart_reviews/*` |
| PUT | `/buy/checkout_previews/*` |
| POST | `/idn/phone/*` |

**Auth surface:** `Cookie: sid=<session-uuid>` + Bearer in OIDC localStorage (`oidc.user:nike:default`). The `sid` cookie lives on `.accounts.nike.com` (NOT `www.nike.com`).

**Bot strategy:** use Playwright's `page.request.fetch(url, init)` so the request inherits the page's cookie jar AND its KPSDK fingerprint. Direct Node `fetch()` would be blocked.

## Cart APIs

### Initialize cart (visitor merge)
`PATCH https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY`

Body (RFC 6902 JSON Patch):
```json
[{"op":"merge","path":"/","value":{"visitorId":"<uuid>"}}]
```

Returns full cart shape with `id` (UUID), `country`, `currency`, `totals`, `items`.

### Add to cart
Same endpoint, different patch:
```json
[{
  "op":"add",
  "path":"/items",
  "value":{
    "itemData": {"url":"/fr/t/<slug>/<styleColor>"},
    "skuId": "<uuid>",
    "quantity": 1
  }
}]
```

`skuId` is a UUID per size variant — distinct from the styleColor (`CW2288-111`). Resolve via `GET https://api.nike.com/product_feed/threads/v3/?filter=marketplace(FR)&filter=productCode(<styleColor>)`.

### Read cart
`GET https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM`

## Checkout APIs

### Cart views (state machine for shipping/payment/review)
- `PUT /buy/cart_views/v1/<view-uuid>` — write a view (shipping, payment, etc.). Each view has a UUID generated client-side.
- `GET /buy/cart_views/v1/<view-uuid>` — read view state.

### Fulfillment options (shipping methods)
- `GET /buy/fulfillment_offerings/v1?filter=countryCode(FR)&filter=currency(EUR)&filter=skuId(<sku>)` — available shipping carriers.
- `GET /buy/fulfillment_types/v1?filter=countryCode(FR)` — `SHIP` vs `PICKUP`.
- `PUT /buy/fulfillment_offerings_jobs/v2/<job-uuid>` — async price calculation job.
- `GET /buy/fulfillment_offerings_jobs/v2/<job-uuid>` — poll job result.

### Payment options
- `POST /payment/options/v3` — list available payment methods (cards, PayPal, etc.) for this cart.

### Pre-submit review
- `PUT /buy/cart_reviews/v2/<review-uuid>` — final review payload (shipping address, payment method, all line items).
- `GET /buy/cart_reviews/v2/<review-uuid>` — fetch computed totals + tax + final order shape.

### Submit order
- `PUT /buy/checkouts/<cart-uuid>` — final checkout, returns `orderNumber`. (KPSDK protected.)

## Other useful endpoints

| Endpoint | Purpose |
|---|---|
| `GET /buy/promotion_visibility/v1/styleColor/<sc>/consumerChannelId/<uuid>/marketplace/FR/language/fr` | Promo eligibility for a styleColor |
| `GET /buy/wishlists/v2/lists?marketplace=FR&isDefault=true` | User's default favorites list |
| `GET /buy/wishlists/v2/lists/<list-uuid>/items?marketplace=FR&anchor=0&count=25` | Items in favorites |
| `POST /launch/entries/v3` | Enter a SNKRS raffle (KPSDK protected) |

## Implementation outline — `cartApi.ts`

```typescript
import type { Page } from 'playwright'

export class NikeCartApi {
  constructor(private page: Page, private market = 'FR') {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    // page.request.fetch inherits the page's KPSDK token + cookies + fingerprint
    const res = await this.page.request.fetch(`https://api.nike.com${path}`, init)
    if (!res.ok()) throw new Error(`${init.method} ${path}: ${res.status()}`)
    return res.json() as Promise<T>
  }

  initVisitor(visitorId: string) {
    return this.request(`/buy/carts/v2/${this.market}/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json-patch+json' },
      data: JSON.stringify([{op:'merge', path:'/', value:{visitorId}}]),
    })
  }

  addItem(skuId: string, slug: string, styleColor: string, qty = 1) {
    return this.request(`/buy/carts/v2/${this.market}/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json-patch+json' },
      data: JSON.stringify([{
        op:'add', path:'/items',
        value: { itemData:{url:`/fr/t/${slug}/${styleColor}`}, skuId, quantity:qty }
      }]),
    })
  }

  getCart() {
    return this.request(`/buy/carts/v2/${this.market}/NIKE/NIKECOM`, { method:'GET' })
  }
}
```

## What still needs DOM (cannot be APIfied easily)

1. **Adyen card tokenization** — Nike uses Adyen Web Components which encrypt card data client-side via an Adyen-hosted iframe before sending the encrypted blob to `/payment/options/v3`. The bot MUST type into the Adyen iframe.
2. **3D Secure challenge** — issuer-controlled iframe popup. Cannot be bypassed; needs interactive validation.
3. **KPSDK token bootstrap** — only granted to a real browser context running `p.js`. Headless curl will be blocked.

Everything else (cart, shipping address, fulfillment, review, submit) is achievable via the API surface above.

## B2B service architecture sketch

```
Customer dev calls our REST:
  POST /v1/drops          { sku, sizes[], maxAccounts }   → dropId
  POST /v1/drops/{id}/run { creditCard? }                  → 202 Accepted

Our backend per drop:
  1. Pool of headed Chrome workers (1 per Nike account, persistent profiles)
  2. SDK polls for SKU
  3. On stock → workers parallel:
     a. cartApi.initVisitor() → cartApi.addItem()
     b. cartApi.putCartView(shippingAddress)
     c. fulfillmentJob → wait → review
     d. DOM-fill Adyen iframe with stored card (per-account vault)
     e. PUT /buy/checkouts/{cartId} → orderNumber
  4. WebSocket /v1/drops/{id}/events streams cop/fail per account

Pricing: per-cop fee + monthly subscription for X accounts.
```
