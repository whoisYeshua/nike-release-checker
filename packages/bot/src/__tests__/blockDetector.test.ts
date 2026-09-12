import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

function makePage(options: {
  url?: string
  title?: string
  captchaVisible?: boolean
  blockIndicatorVisible?: boolean
  bodyText?: string
}): unknown {
  const {
    url = 'https://www.nike.com/fr/launch/t/some-shoe',
    title = 'Nike Product',
    captchaVisible = false,
    blockIndicatorVisible = false,
  } = options
  return {
    url: () => url,
    title: async () => title,
    locator: (selector: string) => {
      const isCaptcha = ['[data-sitekey]', '#captcha-container', '.g-recaptcha', '.h-captcha',
        'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]'].includes(selector)
      const isBlockIndicator = selector === '.block-indicator'
      return {
        isVisible: async () => {
          if (isCaptcha) return captchaVisible
          if (isBlockIndicator) return blockIndicatorVisible
          return false
        },
      }
    },
    textContent: async () => '',
  }
}

function makeResponse(status: number): unknown {
  return { status: () => status }
}

const selectors = {
  productPage: {
    soldOutIndicator: '',
    addToCartButton: '',
    sizeGrid: '',
    sizeButton: '',
    blockIndicator: '.block-indicator',
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
}

describe('blockDetector', () => {
  test('returns not blocked for normal page', async () => {
    const { detectBlock } = await import('../checkout/detectors/blockDetector.ts')
    const page = makePage({})
    const result = await detectBlock(page as never, null, selectors as never)
    assert.equal(result.blocked, false)
    assert.equal(result.reason, null)
  })

  test('detects http_403 from response status', async () => {
    const { detectBlock } = await import('../checkout/detectors/blockDetector.ts')
    const page = makePage({})
    const response = makeResponse(403)
    const result = await detectBlock(page as never, response as never, selectors as never)
    assert.equal(result.blocked, true)
    assert.equal(result.reason, 'http_403')
  })

  test('detects akamai_challenge from URL', async () => {
    const { detectBlock } = await import('../checkout/detectors/blockDetector.ts')
    const page = makePage({ url: 'https://www.nike.com/akamai/challenge?id=abc' })
    const result = await detectBlock(page as never, null, selectors as never)
    assert.equal(result.blocked, true)
    assert.equal(result.reason, 'akamai_challenge')
  })

  test('detects cloudflare_challenge from page title', async () => {
    const { detectBlock } = await import('../checkout/detectors/blockDetector.ts')
    const page = makePage({ title: 'Just a moment...' })
    const result = await detectBlock(page as never, null, selectors as never)
    assert.equal(result.blocked, true)
    assert.equal(result.reason, 'cloudflare_challenge')
  })

  test('detects captcha from visible captcha element', async () => {
    const { detectBlock } = await import('../checkout/detectors/blockDetector.ts')
    const page = makePage({ captchaVisible: true })
    const result = await detectBlock(page as never, null, selectors as never)
    assert.equal(result.blocked, true)
    assert.equal(result.reason, 'captcha')
  })

  test('detects block_indicator from custom selector', async () => {
    const { detectBlock } = await import('../checkout/detectors/blockDetector.ts')
    const page = makePage({ blockIndicatorVisible: true })
    const result = await detectBlock(page as never, null, selectors as never)
    assert.equal(result.blocked, true)
    assert.equal(result.reason, 'block_indicator')
  })

  test('assertNotBlocked throws with code BLOCKED when blocked', async () => {
    const { assertNotBlocked } = await import('../checkout/detectors/blockDetector.ts')
    const page = makePage({})
    const response = makeResponse(403)
    await assert.rejects(
      () => assertNotBlocked(page as never, response as never, selectors as never),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'BLOCKED')
        return true
      },
    )
  })
})
