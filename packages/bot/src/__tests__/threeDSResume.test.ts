import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('threeDSResume', () => {
  test('handle3DSIfRequired returns success with 3ds_completed details when iframe disappears', async () => {
    const { handle3DSIfRequired } = await import('../checkout/steps/handle3DS.ts')

    const page = {
      url: () => 'https://www.nike.com/checkout',
      locator: (selector: string) => ({
        isVisible: async () => selector === 'iframe.three-ds',
      }),
      waitForSelector: async (_selector: string, opts: { state?: string; timeout?: number }) => {
        if (opts.state === 'hidden') return {}
      },
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

    const result = await handle3DSIfRequired(page as never, selectors as never, 5000)
    assert.ok(result !== null, 'should return a step result')
    assert.equal(result!.outcome, 'success')
    assert.equal(result!.details, '3ds_completed')
    assert.equal(result!.step, '3ds-validation')
  })

  test('classifyOutcome returns 3ds_success when 3ds-validation step succeeded', async () => {
    const { classifyOutcome } = await import('../checkout/outcomeClassifier.ts')

    const steps = [
      { step: 'select-size', outcome: 'success' as const, durationMs: 100 },
      { step: 'add-to-cart', outcome: 'success' as const, durationMs: 80 },
      { step: '3ds-validation', outcome: 'success' as const, durationMs: 12000, details: '3ds_completed' },
      { step: 'submit-order', outcome: 'success' as const, durationMs: 200 },
    ]

    const outcome = classifyOutcome(steps)
    assert.equal(outcome, '3ds_success')
  })
})
