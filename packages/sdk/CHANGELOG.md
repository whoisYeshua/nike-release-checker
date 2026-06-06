# @nike-release-checker/sdk

## 1.0.0

### Major Changes

- 03b832d: Stable release ⭐️

## 0.6.0

### Minor Changes

- 56e3bec: Migrate SEA build pipeline to Node.js 26
  - Upgrade Node.js baseline from 24.x to 26.3.0
  - Replace manual `postject` injection pipeline with built-in `node --build-sea`; removes the `postject` devDependency, the intermediate blob file, and the Node binary copy step
  - Add `mainFormat: "commonjs"` to SEA config to make CJS mode explicit and resilient to future Node defaults changes
  - Drop `--experimental-webstorage` flag from all scripts — Web Storage is enabled by default since Node 25.0.0
  - Add `engines.node: ">=26.3"` to packages

## 0.5.0

### Minor Changes

- cb80984: Add compiled JS output to published tarball

  SDK release tarball now includes compiled JavaScript and TypeScript declaration files in `dist/` instead of raw TypeScript sources. The `publishConfig.exports` field redirects consumers to `./dist/*.js` entries, while local monorepo usage continues to resolve `.ts` files directly.

### Patch Changes

- c7b2263: chore: update dependencies

## 0.4.4

### Patch Changes

- a62a061: Accept `button` as a valid `actionType` in the product feed `ActionSchema` to handle API responses (e.g. US marketplace) that include this value alongside `cta_buying_tools` and `minicard_link`.

## 0.4.3

### Patch Changes

- 0c3a6f0: Upgrade the CLI to Rspack 2, bump related runtime dependencies (Ink, nanostores, and MSW), and align the SDK’s MSW peer range with the CLI. Refresh root dev tooling (@changesets/cli, Prettier, TypeScript) and the lockfile.

## 0.4.2

### Patch Changes

- 60161e3: Make `collectionTermIds` and `groupedCollectionTermIds` optional in product feed schema to handle API responses that omit these fields (e.g. SG marketplace).

## 0.4.1

### Patch Changes

- 54cae07: Allow `"light"` as a valid `colorTheme` value in `PublishedContentNodePropertiesSchema` and `PurplePropertiesSchema`

## 0.4.0

### Minor Changes

- 7f44d29: Add per-model image URLs to formatted product feed releases by mapping published content nodes to models via product ID, while keeping the release cover image as a fallback.

## 0.3.7

### Patch Changes

- a05de43: Make `styleType` optional in `AvailableGtinSchema` to handle API responses where the field is absent
- a7cb6eb: tolerate product feed schema drift for Italy

## 0.3.6

### Patch Changes

- 40ff084: migrate to TS6, update deps
- ec83ec5: Update GitHub Actions to newer major versions for release artifact handling and product feed state caching.
- 56e067f: Accept the new `filmstrip` and `stacked` product feed container types.

## 0.3.5

### Patch Changes

- db944ce: Fix ProductFeed DestinationSchema to support URL destination type

## 0.3.4

### Patch Changes

- b1ec4c8: fix(sdk): make `hex` optional in product feed `ColorSchema` to handle Nike API responses missing the field

## 0.3.3

### Patch Changes

- cad67ea: dedupe product feed releases by slug
- 3e570d5: sort releases based on their start entry date
- e4b4456: update deps
- 3ffbe94: Removed SportTagSchema and replaced sportTags in MerchProductSchema with an array of strings for improved flexibility.

## 0.3.2

### Patch Changes

- aeaae1c: Update CoverCardPropertiesSchema to make 'custom' and 'style' properties optional due JP region issues

## 0.3.1

### Patch Changes

- 5ee12ae: Add `msw` as an optional peer dependency so consumers using the SDK mock handlers can install and control the `msw` version explicitly.

## 0.3.0

### Minor Changes

- c644485: Update response schema & update deps

## 0.2.1

### Patch Changes

- update schema, make skus optional

## 0.2.0

### Minor Changes

- Add new handlers entprypoint to sdk package

### Patch Changes

- 9315319: Seed SDK release tracking with the first Changeset entry.
