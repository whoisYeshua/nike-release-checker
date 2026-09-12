import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page, Locator } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'
import { dismissCookieConsent } from '../checkout/dismissCookies.ts'

const SELECTORS_WITH_CONSENT: Selectors = {
  loginEmailInput: '', loginContinueButton: '', loginPasswordInput: '',
  loginSubmitButton: '', loginSuccessIndicator: '', loginErrorIndicator: '',
  sizeAvailable: '', sizeSelected: '', purchaseButton: '', checkoutLink: '',
  shippingSaveButton: '', paymentContinueButton: '', orderSubmitButton: '',
  soldOutIndicator: '', blockDetectionSignal: '', threeDSecureIframe: '',
  productPage: { sizeGrid: '', sizeButton: '', addToCartButton: '', soldOutIndicator: '', blockIndicator: '' },
  cart: { checkoutButton: '', cartCount: '' },
  checkout: {
    shippingContinueButton: '', paymentSection: '', paymentContinueButton: '',
    threeDSIframe: '', submitOrderButton: '', orderConfirmation: '',
  },
  cookieConsent: {
    modalRoot: '[data-testid="cookie-modal-root"]',
    declineButton: '[data-testid="modal-decline-button"]',
    acceptButton: '[data-testid="modal-accept-button"]',
  },
}

const SELECTORS_EMPTY_CONSENT: Selectors = {
  ...SELECTORS_WITH_CONSENT,
  cookieConsent: { modalRoot: '', declineButton: '', acceptButton: '' },
}

interface MockLocatorCalls {
  waitForCalls: Array<{ selector: string; state: string; timeout: number }>
  clickCalls: string[]
  visibleMap: Record<string, boolean>
  modalVisibilityChange?: { initial: boolean; afterClick: boolean }
}

function makeMockPage(
  modalVisible: boolean,
  declineVisible: boolean,
  calls: MockLocatorCalls,
): Page {
  let currentModalVisible = modalVisible
  return {
    locator: (selector: string): Locator => ({
      waitFor: async (opts: { state: string; timeout: number }) => {
        calls.waitForCalls.push({ selector, state: opts.state, timeout: opts.timeout })
        if (opts.state === 'visible') {
          if (!currentModalVisible) {
            throw new Error('not visible')
          }
        }
        if (opts.state === 'hidden') {
          if (currentModalVisible) {
            throw new Error('still visible')
          }
        }
      },
      isVisible: async () => {
        if (selector.includes('decline-button')) return declineVisible
        if (selector.includes('accept-button')) return !declineVisible
        return false
      },
      click: async () => {
        calls.clickCalls.push(selector)
        // Clicking decline dismisses the modal
        currentModalVisible = false
      },
    }) as unknown as Locator,
  } as unknown as Page
}

describe('dismissCookieConsent', () => {
  it('returns false when cookieConsent.modalRoot is not configured', async () => {
    const calls: MockLocatorCalls = { waitForCalls: [], clickCalls: [], visibleMap: {} }
    const page = makeMockPage(true, true, calls)
    const result = await dismissCookieConsent(page, SELECTORS_EMPTY_CONSENT)
    assert.equal(result, false)
    assert.equal(calls.waitForCalls.length, 0, 'should not interact with page')
  })

  it('returns false when modal is not present (waitFor visible throws)', async () => {
    const calls: MockLocatorCalls = { waitForCalls: [], clickCalls: [], visibleMap: {} }
    const page = makeMockPage(false, true, calls)
    const result = await dismissCookieConsent(page, SELECTORS_WITH_CONSENT, 200)
    assert.equal(result, false)
    assert.equal(calls.clickCalls.length, 0, 'no click should happen if modal absent')
  })

  it('clicks decline when modal is visible and decline button is visible', async () => {
    const calls: MockLocatorCalls = { waitForCalls: [], clickCalls: [], visibleMap: {} }
    const page = makeMockPage(true, true, calls)
    const result = await dismissCookieConsent(page, SELECTORS_WITH_CONSENT)
    assert.equal(result, true)
    assert.equal(calls.clickCalls.length, 1)
    assert.equal(calls.clickCalls[0], '[data-testid="modal-decline-button"]')
  })

  it('falls back to accept button when decline is not visible', async () => {
    const calls: MockLocatorCalls = { waitForCalls: [], clickCalls: [], visibleMap: {} }
    const page = makeMockPage(true, false, calls)
    const result = await dismissCookieConsent(page, SELECTORS_WITH_CONSENT)
    assert.equal(result, true)
    assert.equal(calls.clickCalls.length, 1)
    assert.equal(calls.clickCalls[0], '[data-testid="modal-accept-button"]')
  })

  it('waits for modal to disappear after clicking', async () => {
    const calls: MockLocatorCalls = { waitForCalls: [], clickCalls: [], visibleMap: {} }
    const page = makeMockPage(true, true, calls)
    await dismissCookieConsent(page, SELECTORS_WITH_CONSENT)
    const hiddenWaits = calls.waitForCalls.filter((c) => c.state === 'hidden')
    assert.equal(hiddenWaits.length, 1, 'should wait for modal to hide after click')
  })
})
