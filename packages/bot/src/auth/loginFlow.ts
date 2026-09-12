import type { Page } from 'playwright'
import type { Selectors } from '../config/selectorSchema.ts'
import type { LoginFailureReason, LoginResult } from './auth.types.ts'
import { dismissCookieConsent } from '../checkout/dismissCookies.ts'

const LOGIN_URL = 'https://www.nike.com/fr/register'
const WARMUP_URL = 'https://www.nike.com/fr'
const STEP_TIMEOUT = 20_000
// Kasada plants its kpf/kpss cookies and bootstraps its sensor (ips.js) on the
// first page hit. If we go straight to /register or accounts.nike.com without
// that warm-up, the first protected XHR ships an unsigned request, the response
// comes back as an encrypted blob the React client can't parse, and the user
// sees "Erreur lors de l'analyse de la réponse du serveur" right after the
// email step. 2.5s is enough on a warm proxy; bump if you see flake.
const WARMUP_SETTLE_MS = 2_500

const BLOCKED_ERROR_PATTERNS = [
	/erreur lors de l'analyse de la reponse du serveur/i,
	/erreur lors de l’analyse de la réponse du serveur/i,
	/access denied/i,
	/akamai/i,
	/blocked/i,
	/bot/i,
	/forbidden/i,
	/kasada/i,
]

const INVALID_CREDENTIAL_PATTERNS = [
	/invalid/i,
	/incorrect/i,
	/mot de passe/i,
	/password/i,
	/identifiants/i,
]

function normalizeErrorText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[’']/g, "'")
}

export function classifyLoginFailure(errorText: string): LoginFailureReason {
	const normalized = normalizeErrorText(errorText)
	if (BLOCKED_ERROR_PATTERNS.some((pattern) => pattern.test(errorText) || pattern.test(normalized))) {
		return 'blocked'
	}
	if (INVALID_CREDENTIAL_PATTERNS.some((pattern) => pattern.test(errorText) || pattern.test(normalized))) {
		return 'invalid_credentials'
	}
	return 'error'
}

async function warmupKasada(page: Page): Promise<void> {
	// Best-effort warm-up — never fail the login because the warm-up navigation
	// errored. If nike.com/fr is unreachable, the subsequent /register navigation
	// will surface the real error.
	try {
		await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT })
		await page.waitForTimeout(WARMUP_SETTLE_MS)
	} catch {}
}

async function openLoginForm(page: Page, selectors: Selectors): Promise<void> {
	await warmupKasada(page)
	await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT })
	await dismissCookieConsent(page, selectors, 1500)
	await page.waitForSelector(selectors.loginEmailInput, { timeout: STEP_TIMEOUT })
}

// Selector candidates for the "Utiliser le mot de passe" link/button shown on
// accounts.nike.com/challenge-code after the email step. Nike defaults to
// emailing an OTP; this link switches the flow back to the password field.
// We try several since Nike's DOM is volatile.
const USE_PASSWORD_SELECTORS = [
	'button:has-text("Utiliser le mot de passe")',
	'a:has-text("Utiliser le mot de passe")',
	'[role="button"]:has-text("Utiliser le mot de passe")',
	'button:has-text("Use password")',
	'a:has-text("Use password")',
	'button[data-testid*="password" i]:not([type="submit"])',
] as const

/**
 * After submitting the email Nike redirects to accounts.nike.com/challenge-code,
 * which by default offers an emailed OTP. Click "Utiliser le mot de passe" to
 * switch to the password field. Best-effort: if the link is absent (Nike
 * routed straight to the password step), we just return.
 */
async function clickUsePasswordIfPresent(page: Page): Promise<boolean> {
	for (const sel of USE_PASSWORD_SELECTORS) {
		try {
			const loc = page.locator(sel).first()
			if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
				await loc.click({ timeout: 3000 })
				// Give Nike a moment to swap challenge → password field.
				await page.waitForTimeout(500)
				return true
			}
		} catch {
			// try next selector
		}
	}
	return false
}

export async function performNikeLogin(
	page: Page,
	email: string,
	password: string,
	selectors: Selectors,
): Promise<LoginResult> {
	const startMs = Date.now()
	try {
		await openLoginForm(page, selectors)

		// Step 1: Enter email and click continue
		await page.fill(selectors.loginEmailInput, email)
		await page.click(selectors.loginContinueButton)

		// Step 1b: Nike's OAuth challenge page defaults to emailing an OTP.
		// Click "Utiliser le mot de passe" to switch back to the password field.
		// No-op if Nike served the password step directly. Wait briefly first
		// so the challenge page has time to render.
		await page.waitForTimeout(800)
		await clickUsePasswordIfPresent(page)

		// Step 2: Enter password and submit
		const passwordOutcome = await Promise.race([
			page
				.waitForSelector(selectors.loginPasswordInput, { timeout: STEP_TIMEOUT, state: 'visible' })
				.then(() => 'password' as const)
				.catch(() => null),
			page
				.waitForSelector(selectors.loginErrorIndicator, { timeout: STEP_TIMEOUT })
				.then(() => 'error' as const)
				.catch(() => null),
		])
		if (passwordOutcome === null) {
			return {
				success: false,
				error: `Timeout waiting for password field (${STEP_TIMEOUT}ms)`,
				failureReason: 'timeout',
				durationMs: Date.now() - startMs,
			}
		}
		if (passwordOutcome === 'error') {
			let errorText: string | null = null
			try {
				errorText = await page.textContent(selectors.loginErrorIndicator)
			} catch {}
			return {
				success: false,
				error: errorText?.trim() ?? 'Login error indicator detected',
				failureReason: classifyLoginFailure(errorText?.trim() ?? ''),
				durationMs: Date.now() - startMs,
			}
		}
		await page.fill(selectors.loginPasswordInput, password)
		await page.click(selectors.loginSubmitButton)

		// Step 3: Wait for success or error indicator (race)
		// .catch(() => null) absorbs the losing branch so it doesn't leak for the full STEP_TIMEOUT.
		// null means both indicators timed out → treat as timeout failure.
		const outcome = await Promise.race([
			page
				.waitForSelector(selectors.loginSuccessIndicator, { timeout: STEP_TIMEOUT })
				.then(() => 'success' as const)
				.catch(() => null),
			page
				.waitForSelector(selectors.loginErrorIndicator, { timeout: STEP_TIMEOUT })
				.then(() => 'error' as const)
				.catch(() => null),
		])

		if (outcome === null) {
			return {
				success: false,
				error: `Login timed out waiting for outcome (${STEP_TIMEOUT}ms)`,
				failureReason: 'timeout',
				durationMs: Date.now() - startMs,
			}
		}

		if (outcome === 'error') {
			// Wrap in try/catch — element may detach between waitForSelector and textContent (TOCTOU)
			let errorText: string | null = null
			try {
				errorText = await page.textContent(selectors.loginErrorIndicator)
			} catch {
				// element detached; fall through to generic message
			}
			return {
				success: false,
				error: errorText?.trim() ?? 'Login error indicator detected',
				failureReason: classifyLoginFailure(errorText?.trim() ?? ''),
				durationMs: Date.now() - startMs,
			}
		}

		return { success: true, durationMs: Date.now() - startMs }
	} catch (err) {
		return { success: false, error: String(err), failureReason: 'error', durationMs: Date.now() - startMs }
	}
}
