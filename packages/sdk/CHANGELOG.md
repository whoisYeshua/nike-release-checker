# @nike-release-checker/sdk

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
