# Country Registry

Single source of truth for all Nike-supported country metadata. Every module that needs country-specific data (cart endpoint, locale headers, Adyen iframe, address validation) must import `countryRegistry`, never an entry file directly.

## How to add a country

1. Create `entries/<cc>.ts` (lowercase ISO code), export a `Country` const frozen with `Object.freeze`.
2. Import it in `registry.ts` and add it to the `ENTRIES` array.
3. Set `enabled: false` initially; promote to `true` when the country is fully validated end-to-end.

## How to promote a country to enabled

Change `enabled: false` → `enabled: true` in `entries/<cc>.ts`. No shape change required — all downstream stories already accept any `Country` object.

## Valibot guarantee

At module load, every entry in `ENTRIES` is validated against `CountrySchema` via `v.parse`. A shape drift (wrong regex format, missing field) throws immediately on import — never silently at runtime.

## No-direct-field-access rule

Every other module imports `countryRegistry`, never an entry file directly. This ensures the single source of truth and allows the registry to evolve (caching, overrides) without touching consumers.
