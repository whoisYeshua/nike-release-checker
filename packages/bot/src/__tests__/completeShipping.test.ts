import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page, Locator } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'
import { completeShipping } from '../checkout/steps/completeShipping.ts'

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
  productPage: { sizeGrid: '', sizeButton: '', addToCartButton: '', soldOutIndicator: '', blockIndicator: '' },
  cart: { checkoutButton: '', cartCount: '' },
  checkout: {
    shippingContinueButton: '[data-qa="shipping-continue-button"]',
    paymentSection: '[data-qa="payment-section"]',
    paymentContinueButton: '',
    threeDSIframe: '',
    submitOrderButton: '',
    orderConfirmation: '',
  },
  cookieConsent: { modalRoot: '', declineButton: '', acceptButton: '' },
}

type Scenario = 'success' | 'button-disabled' | 'timeout-shipping' | 'timeout-payment'

function makeMockPage(scenario: Scenario): Page {
  let waitCallCount = 0
  return {
    locator: (selector: string): Locator => {
      if (selector === BASE_SELECTORS.checkout.shippingContinueButton) {
        return {
          isVisible: async () => scenario !== 'button-disabled',
          isEnabled: async () => scenario !== 'button-disabled',
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
      waitCallCount++
      if (scenario === 'timeout-shipping' && waitCallCount === 1) {
        throw Object.assign(new Error('Timeout waiting for shipping button'), { code: 'TIMEOUT' })
      }
      if (scenario === 'timeout-payment' && waitCallCount === 2) {
        throw Object.assign(new Error('Timeout waiting for payment section'), { code: 'TIMEOUT' })
      }
      return null
    },
  } as unknown as Page
}

describe('completeShipping', () => {
  it('returns success when shipping continue button is clicked', async () => {
    const result = await completeShipping(makeMockPage('success'), BASE_SELECTORS)
    assert.equal(result.outcome, 'success')
    assert.equal(result.details, 'shipping-complete')
    assert.ok(result.durationMs >= 0)
  })

  it('returns timeout when shipping button is disabled/not ready', async () => {
    const result = await completeShipping(makeMockPage('button-disabled'), BASE_SELECTORS)
    assert.equal(result.outcome, 'timeout')
    assert.ok(result.error?.includes('not ready'))
  })

  it('returns timeout when shipping button selector does not appear', async () => {
    const result = await completeShipping(makeMockPage('timeout-shipping'), BASE_SELECTORS, { timeoutMs: 500 })
    assert.equal(result.outcome, 'timeout')
  })

  it('returns timeout when payment section does not appear after clicking', async () => {
    const result = await completeShipping(makeMockPage('timeout-payment'), BASE_SELECTORS, { timeoutMs: 500 })
    assert.equal(result.outcome, 'timeout')
  })
})
