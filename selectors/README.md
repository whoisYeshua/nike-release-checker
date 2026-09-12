# Per-Country Selector Overrides

## Why Per-Country Overrides Exist

Nike runs slightly different DOM structures per market (different data-attr values,
button labels, locale-specific URL segments, and occasionally alternate input names).
Maintaining one large selector file per country would mean duplicating ~40 keys for
every market and manually patching each file whenever Nike updates their global DOM.

Instead, each country file contains **only the deltas** — keys whose selectors differ
from the French (FR) baseline. The loader deep-merges `selectors.yaml` (base) with
`selectors/<CC>.yaml` (country overrides) at runtime.

## File Layout

```
selectors.yaml          # base selectors (FR-derived, v3.0 only enabled country)
selectors/
  US.yaml               # US-specific overrides (example)
  GB.yaml               # UK-specific overrides
  JP.yaml               # Japan-specific overrides
  README.md             # this file
```

## How Deep Merge Works

Given `selectors.yaml`:

```yaml
shippingSaveButton: '[data-attr="saveAddressBtn"]'
checkout:
  submitOrderButton: '[data-attr="placeOrderBtn"]'
  orderConfirmation: '.order-confirmed'
```

And `selectors/US.yaml`:

```yaml
shippingSaveButton: '[data-attr="saveAddressBtn-us"]'
checkout:
  submitOrderButton: 'button[data-us="placeOrder"]'
```

The merged result for US would be:

```yaml
shippingSaveButton: '[data-attr="saveAddressBtn-us"]'   # overridden
checkout:
  submitOrderButton: 'button[data-us="placeOrder"]'    # overridden
  orderConfirmation: '.order-confirmed'                # inherited from base
```

Rules:
- **Keys absent from the country file** inherit from `selectors.yaml`.
- **Keys present in the country file** override the base value.
- **Nested objects** are merged per-key (not replaced wholesale) — you can override
  a single leaf inside a nested object without listing the siblings.

## How to Add a New Country Override

1. Create `selectors/<CC>.yaml` (uppercase two-letter ISO code) containing **only**
   the keys that differ from the base.

2. Register the path in the country entry:

   ```typescript
   // packages/bot/src/country/entries/xx.ts
   export const XX: Country = Object.freeze<Country>({
     // ...
     selectorOverridePath: 'selectors/XX.yaml',
     // ...
   })
   ```

   Set `selectorOverridePath: null` to explicitly skip the override lookup (the
   base is used as-is — appropriate for FR, which is the baseline itself).

3. The loader (`packages/bot/src/country/selectorLoader.ts`) picks up the file
   automatically on next invocation; the result is cached in memory for the
   duration of the process.

## Validation Contract

The merged result **must satisfy the full `SelectorsSchema`** defined in
`packages/bot/src/config/selectorSchema.ts`. All required top-level keys must be
present after merging. If a country override accidentally removes a required key
(e.g. by setting it to `null`), the loader throws with the country code and file
paths in the error message — fail-fast before any checkout attempt.

Example error:

```
Invalid selectors for country JP after merging selectors/JP.yaml + selectors.yaml:
  purchaseButton: Expected string
```

## Cache Behavior

Selectors are cached per country code (LRU max 10 entries, no TTL). For dev
hot-reload, call `clearSelectorCache()` exported from `selectorLoader.ts` — the
next `loadSelectorsForCountry()` call will re-read from disk.
