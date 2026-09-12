import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page } from 'playwright'
import { classifyLoginFailure, performNikeLogin } from './loginFlow.ts'
import type { Selectors } from '../config/selectorSchema.ts'

const SEL: Selectors = {
	loginEmailInput: '#email',
	loginContinueButton: '#continue',
	loginPasswordInput: '#password',
	loginSubmitButton: '#submit',
	loginSuccessIndicator: '#success',
	loginErrorIndicator: '#error',
	sizeAvailable: '.size',
	sizeSelected: '.size-sel',
	purchaseButton: '.buy',
	checkoutLink: '.checkout',
	shippingSaveButton: '.ship',
	paymentContinueButton: '.pay',
	orderSubmitButton: '.order',
	soldOutIndicator: '.sold-out',
	blockDetectionSignal: '.block',
	threeDSecureIframe: 'iframe',
	productPage: { sizeGrid: '', sizeButton: '', addToCartButton: '', soldOutIndicator: '', blockIndicator: '' },
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

function makeMockPage(scenario: 'success' | 'error' | 'email-blocked' | 'timeout' | 'goto-throws'): Page {
	const calls: string[] = []

	const page = {
		goto: async (_url: string, _opts?: unknown) => {
			if (scenario === 'goto-throws') throw new Error('Navigation failed')
			calls.push('goto')
		},
		waitForSelector: async (selector: string, _opts?: unknown) => {
			if (scenario === 'timeout' && selector === '#password') {
				throw new Error('Timeout 20000ms exceeded waiting for #password')
			}
			if (scenario === 'email-blocked' && selector === '#password') {
				return new Promise(() => {})
			}
			calls.push(`wait:${selector}`)
			return null
		},
		fill: async (_sel: string, _val: string) => {
			calls.push('fill')
		},
		click: async (_sel: string) => {
			calls.push('click')
		},
		waitForTimeout: async (_ms: number) => {
			calls.push('waitForTimeout')
		},
		textContent: async (_sel: string): Promise<string | null> => {
			if (scenario === 'email-blocked') return "Icône d'alerteErreur lors de l'analyse de la réponse du serveur"
			return scenario === 'error' ? 'Invalid credentials. Please try again.' : null
		},
	} as unknown as Page

	// Override waitForSelector to simulate the success/error race
	const origWait = page.waitForSelector.bind(page)
	;(page as unknown as Record<string, unknown>)['waitForSelector'] = async (
		selector: string,
	): Promise<unknown> => {
		if (selector === SEL.loginSuccessIndicator || selector === SEL.loginErrorIndicator) {
			if (scenario === 'success' && selector === SEL.loginSuccessIndicator) {
				return null
			}
			if (scenario === 'error' && selector === SEL.loginErrorIndicator) {
				return null
			}
			if (scenario === 'email-blocked' && selector === SEL.loginErrorIndicator) {
				return null
			}
			// The losing side of the race should never resolve — simulate a long wait
			return new Promise(() => {})
		}
		return origWait(selector)
	}

	return page
}

describe('performNikeLogin', () => {
	it('returns success:true on successful login', async () => {
		const result = await performNikeLogin(makeMockPage('success'), 'user@test.com', 'pass', SEL)
		assert.equal(result.success, true)
		assert.equal(result.error, undefined)
		assert.ok(result.durationMs >= 0)
	})

	it('returns success:false with error text when error indicator is detected', async () => {
		const result = await performNikeLogin(makeMockPage('error'), 'user@test.com', 'wrong', SEL)
		assert.equal(result.success, false)
		assert.ok(result.error?.includes('Invalid credentials'))
		assert.equal(result.failureReason, 'invalid_credentials')
		assert.ok(result.durationMs >= 0)
	})

	it('classifies Nike server parse error after email as blocked', async () => {
		const result = await performNikeLogin(makeMockPage('email-blocked'), 'user@test.com', 'pass', SEL)
		assert.equal(result.success, false)
		assert.equal(result.failureReason, 'blocked')
		assert.ok(result.error?.includes("Erreur lors de l'analyse"))
	})

	it('returns success:false when navigation throws', async () => {
		const result = await performNikeLogin(makeMockPage('goto-throws'), 'user@test.com', 'pass', SEL)
		assert.equal(result.success, false)
		assert.ok(result.error?.includes('Navigation failed'))
		assert.equal(result.failureReason, 'error')
	})

	it('returns success:false on timeout waiting for password field', async () => {
		const result = await performNikeLogin(makeMockPage('timeout'), 'user@test.com', 'pass', SEL)
		assert.equal(result.success, false)
		assert.ok(result.error?.includes('Timeout'))
		assert.equal(result.failureReason, 'timeout')
	})

	it('always includes durationMs >= 0', async () => {
		const result = await performNikeLogin(makeMockPage('success'), 'u@e.com', 'p', SEL)
		assert.ok(result.durationMs >= 0, `durationMs should be non-negative, got ${result.durationMs}`)
	})
})

describe('classifyLoginFailure', () => {
	it('recognizes Nike/Kasada-style blocked messages', () => {
		assert.equal(classifyLoginFailure("Erreur lors de l'analyse de la réponse du serveur"), 'blocked')
		assert.equal(classifyLoginFailure('Access denied by Akamai'), 'blocked')
	})

	it('recognizes invalid credential messages', () => {
		assert.equal(classifyLoginFailure('Invalid credentials. Please try again.'), 'invalid_credentials')
	})
})
