import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page, Locator } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'
import { completePayment } from '../checkout/steps/completePayment.ts'

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
    shippingContinueButton: '',
    paymentSection: '[data-qa="payment-section"]',
    paymentContinueButton: '[data-qa="payment-continue-button"]',
    threeDSIframe: 'iframe[name="threeDSIframe"]',
    submitOrderButton: '[data-qa="submit-order-button"]',
    orderConfirmation: '',
  },
  cookieConsent: { modalRoot: '', declineButton: '', acceptButton: '' },
}

type Scenario = 'success' | '3ds-before' | '3ds-after' | 'button-disabled' | 'timeout'

function makeMockPage(scenario: Scenario): Page {
  let clickedPayment = false
  return {
    locator: (selector: string): Locator => {
      if (selector === BASE_SELECTORS.checkout.threeDSIframe) {
        return {
          isVisible: async () => {
            if (scenario === '3ds-before') return true
            if (scenario === '3ds-after') return clickedPayment
            return false
          },
        } as unknown as Locator
      }
      if (selector === BASE_SELECTORS.checkout.paymentContinueButton) {
        return {
          isVisible: async () => scenario !== 'button-disabled',
          isEnabled: async () => scenario !== 'button-disabled',
          click: async () => { clickedPayment = true },
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
        throw Object.assign(new Error('Timeout waiting for selector'), { code: 'TIMEOUT' })
      }
      return null
    },
    frameLocator: (_sel: string) => ({
      first: () => ({
        locator: (_s: string) => ({
          first: () => ({
            isVisible: async () => false,
            inputValue: async () => '',
          }),
        }),
      }),
    }),
  } as unknown as Page
}

describe('completePayment', () => {
  it('returns success when payment continue is clicked and order button appears', async () => {
    const result = await completePayment(makeMockPage('success'), BASE_SELECTORS)
    assert.equal(result.outcome, 'success')
    assert.equal(result.details, 'payment-complete')
    assert.ok(result.durationMs >= 0)
  })

  it('returns 3ds_required when 3DS iframe is visible BEFORE click', async () => {
    const result = await completePayment(makeMockPage('3ds-before'), BASE_SELECTORS)
    assert.equal(result.outcome, '3ds_required')
    assert.ok(result.error?.includes('3DS'))
  })

  it('returns 3ds_required when 3DS iframe appears AFTER click', async () => {
    const result = await completePayment(makeMockPage('3ds-after'), BASE_SELECTORS)
    assert.equal(result.outcome, '3ds_required')
    assert.ok(result.error?.includes('3DS'))
  })

  it('returns timeout when payment button is not ready', async () => {
    const result = await completePayment(makeMockPage('button-disabled'), BASE_SELECTORS)
    assert.equal(result.outcome, 'timeout')
    assert.ok(result.error?.includes('not ready'))
  })

  it('returns timeout when payment section selector times out', async () => {
    const result = await completePayment(makeMockPage('timeout'), BASE_SELECTORS, { timeoutMs: 500 })
    assert.equal(result.outcome, 'timeout')
  })
})
