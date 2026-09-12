import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page, Locator } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'
import { selectSize } from '../checkout/steps/selectSize.ts'

const BASE_SELECTORS: Selectors = {
  loginEmailInput: '',
  loginContinueButton: '',
  loginPasswordInput: '',
  loginSubmitButton: '',
  loginSuccessIndicator: '',
  loginErrorIndicator: '',
  sizeAvailable: '',
  sizeSelected: '',
  purchaseButton: '',
  checkoutLink: '',
  shippingSaveButton: '',
  paymentContinueButton: '',
  orderSubmitButton: '',
  soldOutIndicator: '',
  blockDetectionSignal: '',
  threeDSecureIframe: '',
  productPage: {
    sizeGrid: '[data-testid="size-grid"]',
    sizeButton: '[data-testid="size-{size}"]',
    addToCartButton: '[data-testid="atc-button"]',
    soldOutIndicator: '[data-testid="sold-out"]',
    blockIndicator: '',
  },
  cart: { checkoutButton: '', cartCount: '' },
  checkout: {
    shippingContinueButton: '',
    paymentSection: '',
    paymentContinueButton: '',
    threeDSIframe: '',
    submitOrderButton: '',
    orderConfirmation: '',
  },
  cookieConsent: { modalRoot: '', declineButton: '', acceptButton: '' },
}

function makeMockPage(scenario: 'size-available' | 'sold-out' | 'timeout'): Page {
  const page = {
    goto: async (_url: string, _opts?: unknown) => {},
    waitForSelector: async (_sel: string, _opts?: { timeout?: number }) => {
      if (scenario === 'timeout') {
        throw Object.assign(new Error('Timeout waiting for selector'), { code: 'TIMEOUT' })
      }
      return null
    },
    locator: (selector: string): Locator => {
      const isSizeAvailable = scenario === 'size-available' && selector.includes('42')
      return {
        isVisible: async () => isSizeAvailable,
        isEnabled: async () => isSizeAvailable,
        click: async () => {},
      } as unknown as Locator
    },
  } as unknown as Page
  return page
}

describe('selectSize', () => {
  it('returns success and selectedSize when a matching size is available', async () => {
    const page = makeMockPage('size-available')
    const result = await selectSize(
      page,
      'https://www.nike.com/fr/launch/t/test-shoe',
      ['42', '43'],
      BASE_SELECTORS,
    )
    assert.equal(result.outcome, 'success')
    assert.equal(result.selectedSize, '42')
    assert.equal(result.details, 'size:42')
    assert.ok(result.durationMs >= 0)
  })

  it('returns sold_out when no size is available', async () => {
    const page = makeMockPage('sold-out')
    const result = await selectSize(
      page,
      'https://www.nike.com/fr/launch/t/test-shoe',
      ['42', '43'],
      BASE_SELECTORS,
    )
    assert.equal(result.outcome, 'sold_out')
    assert.equal(result.selectedSize, undefined)
    assert.ok(result.error?.includes('No size available'))
  })

  it('returns timeout when waitForSelector times out', async () => {
    const page = makeMockPage('timeout')
    const result = await selectSize(
      page,
      'https://www.nike.com/fr/launch/t/test-shoe',
      ['42'],
      BASE_SELECTORS,
      500,
    )
    assert.equal(result.outcome, 'timeout')
    assert.equal(result.selectedSize, undefined)
  })

  it('uses the first available size from the target list', async () => {
    // Only size 43 is available (42 is not in the selector match)
    const page: Page = {
      goto: async () => {},
      waitForSelector: async () => null,
      locator: (selector: string): Locator => {
        const available = selector.includes('43')
        return {
          isVisible: async () => available,
          isEnabled: async () => available,
          click: async () => {},
        } as unknown as Locator
      },
    } as unknown as Page

    const result = await selectSize(
      page,
      'https://www.nike.com/fr/launch/t/test-shoe',
      ['42', '43', '44'],
      BASE_SELECTORS,
    )
    assert.equal(result.outcome, 'success')
    assert.equal(result.selectedSize, '43')
  })
})
