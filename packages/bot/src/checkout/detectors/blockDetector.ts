import type { Page, Response } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'

export type BlockReason =
  | 'akamai_challenge'
  | 'cloudflare_challenge'
  | 'captcha'
  | 'http_403'
  | 'http_429'
  | 'block_indicator'
  | null

export interface BlockDetectionResult {
  blocked: boolean
  reason: BlockReason
}

const BLOCK_URL_PATTERNS = [
  { pattern: /akamai/i, reason: 'akamai_challenge' as BlockReason },
  { pattern: /challenge\.cloudflare\.com/i, reason: 'cloudflare_challenge' as BlockReason },
  { pattern: /\.cloudflare\.com\/cdn-cgi\/challenge/i, reason: 'cloudflare_challenge' as BlockReason },
]

const CAPTCHA_SELECTORS = [
  '[data-sitekey]',           // reCAPTCHA / hCaptcha
  '#captcha-container',
  '.g-recaptcha',
  '.h-captcha',
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
]

/**
 * Detects if the current page is blocked by Akamai, Cloudflare, 403, captcha,
 * or a custom block indicator.
 */
export async function detectBlock(
  page: Page,
  response: Response | null,
  selectors: Selectors,
): Promise<BlockDetectionResult> {
  // Check HTTP status — 403 (Forbidden) and 429 (Too Many Requests) both indicate blocks
  if (response != null) {
    const status = response.status()
    if (status === 403) {
      return { blocked: true, reason: 'http_403' }
    }
    if (status === 429) {
      return { blocked: true, reason: 'http_429' }
    }
  }

  // Check URL for known block patterns
  try {
    const currentUrl = page.url()
    for (const { pattern, reason } of BLOCK_URL_PATTERNS) {
      if (pattern.test(currentUrl)) {
        return { blocked: true, reason }
      }
    }
  } catch {
    // page.url() not available in test mocks or during navigation
  }

  // Check page title / content for Cloudflare / Akamai
  try {
    const title = (await page.title()).toLowerCase()
    if (title.includes('access denied') || title.includes('403 forbidden')) {
      return { blocked: true, reason: 'http_403' }
    }
    if (title.includes('just a moment') || title.includes('checking your browser')) {
      return { blocked: true, reason: 'cloudflare_challenge' }
    }
  } catch {
    // page might not be loaded yet
  }

  // Check for captcha elements
  for (const captchaSelector of CAPTCHA_SELECTORS) {
    try {
      const el = page.locator(captchaSelector)
      const isVisible = await el.isVisible()
      if (isVisible) {
        return { blocked: true, reason: 'captcha' }
      }
    } catch {
      // not found
    }
  }

  // Check custom block indicator from selectors
  const blockIndicatorSelector = selectors.productPage?.blockIndicator
  if (blockIndicatorSelector) {
    try {
      const blockEl = page.locator(blockIndicatorSelector)
      const isVisible = await blockEl.isVisible()
      if (isVisible) {
        return { blocked: true, reason: 'block_indicator' }
      }
    } catch {
      // not found
    }
  }

  return { blocked: false, reason: null }
}

/**
 * Throws with code 'BLOCKED' if a block is detected.
 */
export async function assertNotBlocked(
  page: Page,
  response: Response | null,
  selectors: Selectors,
): Promise<void> {
  const result = await detectBlock(page, response, selectors)
  if (result.blocked) {
    throw Object.assign(
      new Error(`Request blocked: ${result.reason}`),
      { code: 'BLOCKED' },
    )
  }
}
