/**
 * Unit tests for selectorLoader — Story 13.4
 *
 * Strategy: write real YAML fixture files to a per-test temp directory, then
 * `process.chdir()` into it before each test so that `loadSelectorsForCountry`
 * resolves `selectors.yaml` and `selectors/<CC>.yaml` correctly. The cache is
 * cleared before every test to guarantee cold-load semantics.
 */

import { describe, it, before, after, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSelectorsForCountry, clearSelectorCache } from './selectorLoader.ts'

// ---------------------------------------------------------------------------
// Minimal valid base selectors YAML (matches SelectorsSchema)
// ---------------------------------------------------------------------------
const BASE_YAML = `
loginEmailInput: 'input[name="credential"]'
loginContinueButton: 'button[type="submit"]'
loginPasswordInput: 'input[name="password"]'
loginSubmitButton: 'button[type="submit"]'
loginSuccessIndicator: '[data-testid="user-menu"]'
loginErrorIndicator: '[role="alert"]'
sizeAvailable: '[data-qa="size-available"]'
sizeSelected: '[data-qa="size-available"][aria-checked="true"]'
purchaseButton: '.ncss-btn-primary-dark'
checkoutLink: 'a[href="/fr/checkout"]'
shippingSaveButton: '[data-attr="saveAddressBtn"]'
paymentContinueButton: '[data-attr="continuePaymentBtn"]'
orderSubmitButton: '[data-attr="placeOrderBtn"]'
soldOutIndicator: '[data-qa="not-available-message"]'
blockDetectionSignal: '#challenge-running'
threeDSecureIframe: 'iframe[src*="3ds"]'
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let originalCwd: string

async function writeBase(content = BASE_YAML): Promise<void> {
  await writeFile(join(tmpDir, 'selectors.yaml'), content, 'utf-8')
}

async function writeOverride(cc: string, content: string): Promise<void> {
  await mkdir(join(tmpDir, 'selectors'), { recursive: true })
  await writeFile(join(tmpDir, 'selectors', `${cc}.yaml`), content, 'utf-8')
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('loadSelectorsForCountry', () => {
  before(async () => {
    tmpDir = join(tmpdir(), `selector-loader-test-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
    originalCwd = process.cwd()
  })

  after(async () => {
    void originalCwd
    await rm(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    // No process.chdir — the loader now accepts an explicit cwd option,
    // avoiding test-isolation pollution that broke unrelated TUI suites.
    clearSelectorCache()
  })

  // -------------------------------------------------------------------------
  // Test 1: no override file → returns base unchanged
  // -------------------------------------------------------------------------
  it('returns base selectors when no override file exists (FR / null selectorOverridePath)', async () => {
    await writeBase()
    // FR has selectorOverridePath: null — should return base as-is
    const selectors = await loadSelectorsForCountry('FR', { cwd: tmpDir })
    assert.equal(selectors.purchaseButton, '.ncss-btn-primary-dark')
    assert.equal(selectors.checkoutLink, 'a[href="/fr/checkout"]')
  })

  // -------------------------------------------------------------------------
  // Test 2: partial override (1 key) → that key overridden, all others inherit
  // -------------------------------------------------------------------------
  it('applies partial override — one key overridden, rest inherited from base', async () => {
    await writeBase()
    await writeOverride('JP', `
shippingSaveButton: '[data-attr="saveAddressBtn-jp"]'
`)
    // JP has selectorOverridePath: 'selectors/JP.yaml' in the registry
    const selectors = await loadSelectorsForCountry('JP', { cwd: tmpDir })
    assert.equal(selectors.shippingSaveButton, '[data-attr="saveAddressBtn-jp"]', 'overridden key')
    assert.equal(selectors.purchaseButton, '.ncss-btn-primary-dark', 'inherited key')
    assert.equal(selectors.loginEmailInput, 'input[name="credential"]', 'inherited key')
  })

  // -------------------------------------------------------------------------
  // Test 3: nested override (checkout.submitOrderButton) — leaf overridden,
  //         sibling keys preserved
  // -------------------------------------------------------------------------
  it('deep-merges nested objects — only the leaf key is overridden', async () => {
    await writeBase()
    // JP registry uses 'selectors/JP.yaml'
    await writeOverride('JP', `
checkout:
  submitOrderButton: 'button[data-jp="placeOrder"]'
`)
    const selectors = await loadSelectorsForCountry('JP', { cwd: tmpDir })
    // Overridden leaf
    assert.equal(selectors.checkout?.submitOrderButton, 'button[data-jp="placeOrder"]')
    // Sibling keys still present (default empty strings from schema)
    assert.equal(typeof selectors.checkout?.shippingContinueButton, 'string', 'sibling key preserved')
    assert.equal(typeof selectors.checkout?.orderConfirmation, 'string', 'sibling key preserved')
  })

  // -------------------------------------------------------------------------
  // Test 4: required key nulled out → validator throws with country code
  // -------------------------------------------------------------------------
  it('throws with country code when merged result is missing a required key', async () => {
    await writeBase()
    // Remove purchaseButton entirely by nulling it in the override
    await writeOverride('JP', `
purchaseButton: ~
`)
    await assert.rejects(
      () => loadSelectorsForCountry('JP', { cwd: tmpDir }),
      (err: Error) => {
        return (
          err.message.includes('JP') &&
          err.message.includes('selectors/JP.yaml')
        )
      },
    )
  })

  // -------------------------------------------------------------------------
  // Test 5: cache hit — second call returns the identical object reference
  // -------------------------------------------------------------------------
  it('returns the cached Selectors object on second call (same reference)', async () => {
    await writeBase()

    const first = await loadSelectorsForCountry('FR', { cwd: tmpDir })
    const second = await loadSelectorsForCountry('FR', { cwd: tmpDir })

    // Strict reference equality proves no re-parse occurred
    assert.strictEqual(first, second, 'second call must return the exact same cached object')
  })

  // -------------------------------------------------------------------------
  // Test 6: clearSelectorCache then re-call → re-reads disk
  // -------------------------------------------------------------------------
  it('re-reads from disk after clearSelectorCache()', async () => {
    await writeBase()

    // Prime cache
    const first = await loadSelectorsForCountry('FR', { cwd: tmpDir })

    // Mutate the file on disk
    await writeBase(`
loginEmailInput: 'input[name="credential-updated"]'
loginContinueButton: 'button[type="submit"]'
loginPasswordInput: 'input[name="password"]'
loginSubmitButton: 'button[type="submit"]'
loginSuccessIndicator: '[data-testid="user-menu"]'
loginErrorIndicator: '[role="alert"]'
sizeAvailable: '[data-qa="size-available"]'
sizeSelected: '[data-qa="size-available"][aria-checked="true"]'
purchaseButton: '.ncss-btn-primary-dark'
checkoutLink: 'a[href="/fr/checkout"]'
shippingSaveButton: '[data-attr="saveAddressBtn"]'
paymentContinueButton: '[data-attr="continuePaymentBtn"]'
orderSubmitButton: '[data-attr="placeOrderBtn"]'
soldOutIndicator: '[data-qa="not-available-message"]'
blockDetectionSignal: '#challenge-running'
threeDSecureIframe: 'iframe[src*="3ds"]'
`)

    // Without clearing cache, should return stale value
    const stale = await loadSelectorsForCountry('FR', { cwd: tmpDir })
    assert.equal(stale.loginEmailInput, first.loginEmailInput, 'cache still active')

    // After clearing, should reflect updated file
    clearSelectorCache()
    const fresh = await loadSelectorsForCountry('FR', { cwd: tmpDir })
    assert.equal(fresh.loginEmailInput, 'input[name="credential-updated"]', 'disk re-read after cache clear')
  })
})
