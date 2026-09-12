import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

function makePage(options: {
  iframeVisible?: boolean
  waitForSelectorResult?: 'hidden' | 'timeout'
}): unknown {
  const { iframeVisible = false, waitForSelectorResult = 'hidden' } = options
  return {
    url: () => 'https://www.nike.com/checkout',
    locator: (selector: string) => ({
      isVisible: async () => selector === 'iframe.three-ds' ? iframeVisible : false,
    }),
    waitForSelector: async (_selector: string, opts: { state?: string; timeout?: number }) => {
      if (opts.state === 'hidden') {
        if (waitForSelectorResult === 'hidden') return {}
        // Simulate timeout
        const timeout = opts.timeout ?? 5000
        throw Object.assign(new Error(`Timeout after ${timeout}ms`), { name: 'TimeoutError' })
      }
    },
  }
}

const selectors = {
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
    paymentSection: '',
    paymentContinueButton: '',
    threeDSIframe: 'iframe.three-ds',
    submitOrderButton: '',
    orderConfirmation: '',
  },
}

describe('threeDSDetector', () => {
  test('detect3DS returns not required when iframe not visible', async () => {
    const { detect3DS } = await import('../checkout/detectors/threeDSDetector.ts')
    const page = makePage({ iframeVisible: false })
    const result = await detect3DS(page as never, selectors as never)
    assert.equal(result.required, false)
  })

  test('detect3DS returns required when iframe visible', async () => {
    const { detect3DS } = await import('../checkout/detectors/threeDSDetector.ts')
    const page = makePage({ iframeVisible: true })
    const result = await detect3DS(page as never, selectors as never)
    assert.equal(result.required, true)
    assert.equal(result.iframeSelector, 'iframe.three-ds')
  })

  test('waitFor3DSCompletion returns true when iframe disappears', async () => {
    const { waitFor3DSCompletion } = await import('../checkout/detectors/threeDSDetector.ts')
    const page = makePage({ iframeVisible: true, waitForSelectorResult: 'hidden' })
    const result = await waitFor3DSCompletion(page as never, 'iframe.three-ds', 5000)
    assert.equal(result, true)
  })

  test('waitFor3DSCompletion returns false on timeout', async () => {
    const { waitFor3DSCompletion } = await import('../checkout/detectors/threeDSDetector.ts')
    const page = makePage({ iframeVisible: true, waitForSelectorResult: 'timeout' })
    const result = await waitFor3DSCompletion(page as never, 'iframe.three-ds', 100)
    assert.equal(result, false)
  })

  test('handle3DSIfRequired returns null when no 3DS', async () => {
    const { handle3DSIfRequired } = await import('../checkout/steps/handle3DS.ts')
    const page = makePage({ iframeVisible: false })
    const result = await handle3DSIfRequired(page as never, selectors as never, 5000)
    assert.equal(result, null)
  })
})
