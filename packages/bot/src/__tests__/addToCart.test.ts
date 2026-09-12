import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page, Locator } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'
import { addToCart } from '../checkout/steps/addToCart.ts'

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
  cart: { checkoutButton: '[data-qa="checkout-button"]', cartCount: '[data-qa="cart-count"]' },
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

type Scenario = 'success' | 'sold-out-indicator' | 'atc-disabled' | 'timeout'

function makeMockPage(scenario: Scenario): Page {
  const page = {
    locator: (selector: string): Locator => {
      if (selector === BASE_SELECTORS.productPage.soldOutIndicator) {
        return {
          isVisible: async () => scenario === 'sold-out-indicator',
        } as unknown as Locator
      }
      if (selector === BASE_SELECTORS.productPage.addToCartButton) {
        return {
          isVisible: async () => scenario !== 'sold-out-indicator',
          isEnabled: async () => scenario !== 'atc-disabled',
          click: async () => {},
        } as unknown as Locator
      }
      return {
        isVisible: async () => false,
        isEnabled: async () => false,
        click: async () => {},
      } as unknown as Locator
    },
    waitForSelector: async (_sel: string, _opts?: unknown) => {
      if (scenario === 'timeout') {
        throw Object.assign(new Error('Timeout waiting for cart count'), { code: 'TIMEOUT' })
      }
      return null
    },
  } as unknown as Page
  return page
}

describe('addToCart', () => {
  it('returns success when ATC button is clicked and cart updates', async () => {
    const result = await addToCart(makeMockPage('success'), BASE_SELECTORS)
    assert.equal(result.outcome, 'success')
    assert.equal(result.details, 'added-to-cart')
    assert.ok(result.durationMs >= 0)
  })

  it('returns sold_out when sold-out indicator is visible', async () => {
    const result = await addToCart(makeMockPage('sold-out-indicator'), BASE_SELECTORS)
    assert.equal(result.outcome, 'sold_out')
    assert.ok(result.error?.includes('sold out'))
  })

  it('returns sold_out when ATC button is disabled', async () => {
    const result = await addToCart(makeMockPage('atc-disabled'), BASE_SELECTORS)
    assert.equal(result.outcome, 'sold_out')
    // checkSoldOut detects button_disabled signal
    assert.ok(result.error !== undefined, 'should have an error message')
  })

  it('returns timeout when cart count selector times out', async () => {
    const result = await addToCart(makeMockPage('timeout'), BASE_SELECTORS, 500)
    assert.equal(result.outcome, 'timeout')
  })
})
