import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page, Locator } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'
import { navigateCheckout } from '../checkout/steps/navigateCheckout.ts'

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
  blockDetectionSignal: '[data-testid="block-detection"]',
  threeDSecureIframe: '',
  productPage: {
    sizeGrid: '',
    sizeButton: '',
    addToCartButton: '',
    soldOutIndicator: '',
    blockIndicator: '',
  },
  cart: { checkoutButton: '[data-qa="checkout-button"]', cartCount: '' },
  checkout: {
    shippingContinueButton: '[data-qa="shipping-continue-button"]',
    paymentSection: '',
    paymentContinueButton: '',
    threeDSIframe: '',
    submitOrderButton: '',
    orderConfirmation: '',
  },
  cookieConsent: { modalRoot: '', declineButton: '', acceptButton: '' },
}

type Scenario = 'success' | 'blocked' | 'no-checkout-button' | 'timeout'

function makeMockPage(scenario: Scenario): Page {
  return {
    locator: (selector: string): Locator => {
      if (selector === BASE_SELECTORS.blockDetectionSignal) {
        return {
          isVisible: async () => scenario === 'blocked',
        } as unknown as Locator
      }
      if (selector === BASE_SELECTORS.cart.checkoutButton) {
        return {
          isVisible: async () => scenario !== 'no-checkout-button',
          click: async () => {},
          waitFor: async (_opts?: { state?: string; timeout?: number }) => {
            if (scenario === 'no-checkout-button') {
              throw Object.assign(new Error('Timeout'), { code: 'TIMEOUT' })
            }
          },
        } as unknown as Locator
      }
      return {
        isVisible: async () => false,
        click: async () => {},
      } as unknown as Locator
    },
    goto: async (_url: string, _opts?: unknown) => null,
    waitForSelector: async (_sel: string, _opts?: unknown) => {
      if (scenario === 'timeout') {
        throw Object.assign(new Error('Timeout waiting for shipping section'), { code: 'TIMEOUT' })
      }
      return null
    },
  } as unknown as Page
}

describe('navigateCheckout', () => {
  it('returns success when checkout button clicked and shipping section appears', async () => {
    const result = await navigateCheckout(makeMockPage('success'), BASE_SELECTORS)
    assert.equal(result.outcome, 'success')
    assert.equal(result.details, 'checkout-page-reached')
    assert.ok(result.durationMs >= 0)
  })

  it('returns blocked when block detection signal is visible', async () => {
    const result = await navigateCheckout(makeMockPage('blocked'), BASE_SELECTORS)
    assert.equal(result.outcome, 'blocked')
    assert.ok(result.error?.includes('detection'))
  })

  it('returns blocked when checkout button is not visible', async () => {
    const result = await navigateCheckout(makeMockPage('no-checkout-button'), BASE_SELECTORS)
    assert.equal(result.outcome, 'blocked')
    assert.ok(result.error?.includes('not visible'))
  })

  it('returns timeout when shipping section does not appear', async () => {
    const result = await navigateCheckout(makeMockPage('timeout'), BASE_SELECTORS, 500)
    assert.equal(result.outcome, 'timeout')
  })
})
