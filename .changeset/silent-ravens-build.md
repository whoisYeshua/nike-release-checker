---
"@nike-release-checker/cli": patch
---

Upgrade image rendering to `ink-picture@2`, cache product images in memory, and simplify SEA builds by removing sharp native asset packaging.

The CLI now passes fetched image bytes directly to `ink-picture`, bundles dynamic imports into the main Rspack output, and emits a single `bundle.cjs` for SEA packaging.
