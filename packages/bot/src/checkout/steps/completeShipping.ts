import type { Page, Locator } from 'playwright'
import type { Selectors } from '../../config/selectorSchema.ts'
import { executeStep, type StepResult } from '../executeStep.ts'
import { naturalClick } from '../naturalClick.ts'
import { displayedAddressMatches, type TargetAddress } from './addressMatcher.ts'

export interface ShippingAddress {
	street: string
	city: string
	zip: string
	country: string
	phone?: string
	firstName?: string
	lastName?: string
	email?: string
}

export interface CompleteShippingOpts {
	timeoutMs?: number
	address?: ShippingAddress
}

/**
 * Try a list of candidate selectors and return the first one that resolves to
 * a visible locator. Wrapped in try/catch so a missing selector never throws —
 * Nike rotates form selectors and we want graceful fallback (placeholder /
 * aria-label matching) before giving up.
 */
async function findFirstVisible(page: Page, candidates: string[]): Promise<Locator | null> {
	for (const sel of candidates) {
		try {
			const loc = page.locator(sel).first()
			if (await loc.isVisible({ timeout: 250 }).catch(() => false)) {
				return loc
			}
		} catch {
			// next candidate
		}
	}
	return null
}

async function fillIfPresent(page: Page, candidates: string[], value: string | undefined): Promise<boolean> {
	if (!value) return false
	const loc = await findFirstVisible(page, candidates)
	if (!loc) return false
	try {
		await loc.fill(value)
		return true
	} catch {
		return false
	}
}

/**
 * Fill the manual shipping-address form fields. Assumes the manual form is
 * already revealed (caller clicks the "Saisir l'adresse manuellement" toggle).
 * Verified live 2026-04-25 against /fr/checkout — Nike uses `name="address.*"`.
 */
async function fillAddressForm(page: Page, addr: ShippingAddress): Promise<void> {
	if (addr.email) {
		await fillIfPresent(page, [
			'input[name="address.email"]',
			'input#email',
			'input[type="email"]',
			'input[autocomplete="shipping email"]',
		], addr.email)
	}
	if (addr.firstName) {
		await fillIfPresent(page, [
			'input[name="address.firstName"]',
			'input#firstName',
			'input[autocomplete="shipping given-name"]',
		], addr.firstName)
	}
	if (addr.lastName) {
		await fillIfPresent(page, [
			'input[name="address.lastName"]',
			'input#lastName',
			'input[autocomplete="shipping family-name"]',
		], addr.lastName)
	}
	await fillIfPresent(page, [
		'input[name="address.address1"]',
		'input#address1',
		'input[autocomplete="shipping street-address"]',
	], addr.street)
	await fillIfPresent(page, [
		'input[name="address.postalCode"]',
		'input#postalCode',
		'input[autocomplete="shipping postal-code"]',
	], addr.zip)
	await fillIfPresent(page, [
		'input[name="address.city"]',
		'input#city',
		'input[autocomplete="shipping address-level2"]',
	], addr.city)
	// Country: readonly select on Nike (auto-set from locale) — skip.
	if (addr.phone) {
		await fillIfPresent(page, [
			'input[name="address.phoneNumber"]',
			'input#phoneNumber',
			'input[autocomplete="shipping tel"]',
			'input[type="tel"]',
		], addr.phone)
	}
	// Blur the last field so Nike's React validation enables the save button.
	await page.keyboard.press('Tab').catch(() => {})
	await page.waitForTimeout(600)
}

/**
 * Reveal the manual-entry fields. Nike hides `name="address.*"` behind the
 * autocomplete typeahead (#search-address-input); the actual inputs are
 * aria-hidden until "Saisir l'adresse manuellement" (#addressSuggestionOptOut)
 * is clicked. Best-effort — no-op if the form is already manual.
 */
async function revealManualAddressFields(page: Page): Promise<void> {
	const manualBtn = page.locator('button#addressSuggestionOptOut').first()
	if (await manualBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
		await naturalClick(page, manualBtn)
		await page.waitForTimeout(400)
		return
	}
	const textBtn = await findFirstVisible(page, [
		'button:has-text("Saisir l\'adresse manuellement")',
		'button:has-text("Saisir l adresse manuellement")',
		'button:has-text("Enter address manually")',
	])
	if (textBtn) {
		await naturalClick(page, textBtn).catch(() => {})
		await page.waitForTimeout(400)
	}
}

/**
 * The address pre-selected by Nike does not match the operator's target. Force
 * the target by clicking "Ajouter une nouvelle adresse", filling the manual
 * form, and saving it (Nike auto-selects a freshly-added address). Best-effort:
 * returns true if the switch likely succeeded, false to let the caller fall
 * back to the pre-selected address (never throws — we must not crash a drop).
 */
async function addNewAddress(
	page: Page,
	addr: ShippingAddress,
	innerTimeout: number,
): Promise<boolean> {
	try {
		const addBtn = await findFirstVisible(page, [
			'button:has-text("Ajouter une nouvelle adresse")',
			'button:has-text("Ajouter une adresse")',
			'button:has-text("Add a new address")',
			'button:has-text("Add address")',
		])
		if (!addBtn) return false
		await naturalClick(page, addBtn)
		// Wait for the address form to mount.
		await page.waitForSelector(
			'input[name="address.address1"], input#address1, button#addressSuggestionOptOut, input#search-address-input',
			{ timeout: innerTimeout, state: 'visible' },
		).catch(() => {})
		await revealManualAddressFields(page)
		await fillAddressForm(page, addr)

		await saveAddressForm(page, innerTimeout)
		return true
	} catch {
		return false
	}
}

/**
 * Save the (now-filled) shipping address form. The button is
 * `button[data-attr="saveAddressBtn"]` ("Enregistrer et continuer") — verified
 * live 2026-05-29 on /fr/checkout. Falls back to text/submit. After saving,
 * waits for the payment step to confirm shipping advanced.
 */
async function saveAddressForm(page: Page, innerTimeout: number): Promise<void> {
	const saveBtn = await findFirstVisible(page, [
		'button[data-attr="saveAddressBtn"]',
		'button:has-text("Enregistrer et continuer")',
		'button:has-text("Utiliser cette adresse")',
		'button:has-text("Enregistrer")',
	])
	const btn = saveBtn ?? page.locator('button[type="submit"]').first()
	await naturalClick(page, btn).catch(() => {})
	// Confirm we advanced to payment (or at least the form closed).
	await page.waitForSelector(
		'input[name="paymentOptions"], iframe[src*="paymentcc.nike.com"], h2:has-text("Paiement")',
		{ timeout: innerTimeout, state: 'attached' },
	).catch(() => {})
}

/**
 * Read the SELECTED shipping address (the preview), not the whole page. Critical
 * when the account has several saved addresses: document.body.innerText contains
 * ALL of them (in the hidden address-book radios), so matching against body text
 * would falsely "match" the target even when a different address is selected.
 */
async function readAddressPreview(page: Page): Promise<string> {
	return page
		.evaluate(() => {
			const p = document.querySelector('[data-attr="addressPreview"]')
			if (p && (p.textContent ?? '').trim()) return p.textContent ?? ''
			const parts = Array.from(document.querySelectorAll('[data-attr^="address-preview"]')).map(
				(e) => e.textContent ?? '',
			)
			if (parts.length) return parts.join(' ')
			return document.body.innerText
		})
		.catch(() => '')
}

/**
 * Enforce the CSV address on a returning account. Nike keeps saved addresses as
 * hidden radios `input[name="storedAddressList"]`, revealed by the shipping
 * "Modifier" (editButton). EDITING/adding creates a NEW duplicate entry (verified
 * live 2026-05-29), so the correct move is to SELECT the radio whose label matches
 * the target (by zip + city), then confirm via "Passer au paiement"
 * (continuePaymentBtn). Only when NO saved address matches do we add a new one
 * (which becomes selected). Best-effort — returns true if a selection was made.
 */
async function selectSavedAddress(
	page: Page,
	addr: ShippingAddress,
	innerTimeout: number,
): Promise<boolean> {
	try {
		// Open the address book so the saved-address radios become interactable.
		const editBtn = await findFirstVisible(page, [
			'#shipping button[data-attr="editButton"]',
			'button[data-attr="editButton"]',
			'#shipping button:has-text("Modifier")',
		])
		if (editBtn) {
			await naturalClick(page, editBtn)
			await page.waitForTimeout(1200)
		}

		// Find the saved-address radio whose label matches the target (zip + city).
		const zip = (addr.zip ?? '').toLowerCase().trim()
		const city = (addr.city ?? '').toLowerCase().trim()
		const matchId: string | null = await page.evaluate(
			({ zip, city }) => {
				const radios = Array.from(document.querySelectorAll('input[name="storedAddressList"]'))
				for (const r of radios) {
					const id = (r as HTMLInputElement).id
					const lab = document.querySelector(`label[for="${id}"]`) ?? r.closest('label')
					const t = (lab?.textContent ?? '').toLowerCase()
					if (zip && city && t.includes(zip) && t.includes(city)) return id
				}
				return null
			},
			{ zip, city },
		)

		if (matchId) {
			// The radio itself is visually hidden — click its label, then ensure checked.
			await page.locator(`label[for="${matchId}"]`).first().click().catch(() => {})
			await page.waitForTimeout(400)
			await page.locator(`input[id="${matchId}"]`).check().catch(() => {})
			await page.waitForTimeout(400)
		} else {
			// No saved address matches → add a new one (Nike auto-selects it).
			const added = await addNewAddress(page, addr, innerTimeout)
			if (!added) return false
		}

		// Confirm the selection → proceed to payment.
		const cont = await findFirstVisible(page, [
			'button[data-attr="continuePaymentBtn"]',
			'button:has-text("Passer au paiement")',
			'button[data-attr="saveAddressBtn"]',
		])
		if (cont) await naturalClick(page, cont)

		// Wait for the payment step by its REAL controls (not the section header).
		await page
			.waitForSelector('input[name="paymentOptions"], iframe[src*="paymentcc.nike.com"]', {
				timeout: innerTimeout,
				state: 'visible',
			})
			.catch(() => {})
		return true
	} catch {
		return false
	}
}

export async function completeShipping(
	page: Page,
	selectors: Selectors,
	opts: CompleteShippingOpts = {},
): Promise<StepResult> {
	const timeoutMs = opts.timeoutMs ?? 8000
	const target: TargetAddress | undefined = opts.address
		? { street: opts.address.street, city: opts.address.city, zip: opts.address.zip, country: opts.address.country }
		: undefined
	return executeStep(
		'complete-shipping',
		async () => {
			// Use shorter timeout than the executeStep race timer to avoid ghost timeout
			const innerTimeout = Math.max(Math.floor(timeoutMs * 0.6), 2000)

			// Shipping may ALREADY be complete: on a persistent profile Nike keeps
			// the saved address and collapses the shipping section, jumping straight
			// to payment. In that case the shipping continue button never appears.
			// Cap this probe at 6s: the page is already loaded by navigate-checkout.
			const probeTimeout = Math.min(innerTimeout, 6000)
			const shippingBtnReady = await page
				.locator(selectors.checkout.shippingContinueButton)
				.first()
				.waitFor({ state: 'visible', timeout: probeTimeout })
				.then(() => true)
				.catch(() => false)

			if (!shippingBtnReady) {
				// Returning account: shipping is collapsed with a saved address selected.
				// Detect payment by the REAL controls (paymentOptions radio / card iframe)
				// — NOT an "h2:Paiement" header, which is ALWAYS present as the disabled
				// step-2 title and gave a false "payment reachable".
				const storedCount = await page.locator('input[name="storedAddressList"]').count().catch(() => 0)
				const paymentReachable = await findFirstVisible(page, [
					'input[name="paymentOptions"]',
					'iframe[src*="paymentcc.nike.com"]',
					'iframe[src*="adyen"]',
				])
				if (!paymentReachable && storedCount === 0) {
					throw Object.assign(
						new Error('Shipping continue button not visible and payment not reachable'),
						{ code: 'TIMEOUT' },
					)
				}

				// Enforce the CSV address. Read the SELECTED address (preview) — not the
				// whole body, which contains every saved address in the hidden radio list.
				if (target) {
					const previewText = await readAddressPreview(page)
					if (displayedAddressMatches(previewText, target)) {
						return 'shipping-already-correct-address'
					}
					console.warn(
						'[shipping] selected address does not match the configured one — selecting the matching saved address (or adding it)',
					)
					const switched = await selectSavedAddress(page, opts.address!, innerTimeout)
					if (switched) {
						const after = await readAddressPreview(page)
						return displayedAddressMatches(after, target)
							? 'shipping-selected-matching-address'
							: 'shipping-select-attempted'
					}
					console.warn(
						'[shipping] could not select/add the configured address — proceeding with Nike pre-selected address (FALLBACK, no crash)',
					)
					return 'shipping-address-mismatch-fallback'
				}

				return 'shipping-already-complete'
			}

			// Shipping section is editable. Detect whether the form is empty.
			const manualToggle = await findFirstVisible(page, [
				'button:has-text("Saisir l\'adresse manuellement")',
				'button:has-text("Saisir l adresse manuellement")',
				'button:has-text("Enter address manually")',
				'[data-testid="manual-address-toggle"]',
			])

			const address1Loc = await findFirstVisible(page, [
				'input[name="address.address1"]',
				'input[name="address1"]',
				'input[name="addressLine1"]',
				'input[aria-label*="dresse"]',
			])
			const address1Value = address1Loc ? await address1Loc.inputValue().catch(() => '') : ''
			const formEmpty = Boolean(manualToggle) || (address1Loc !== null && address1Value.trim() === '')

			if (formEmpty) {
				if (!opts.address) {
					throw Object.assign(
						new Error('shipping form empty and no address provided'),
						{ code: 'ERROR' },
					)
				}
				await revealManualAddressFields(page)
				await fillAddressForm(page, opts.address)
			}

			// Pick the first matching continue button (page has several submit buttons).
			const shippingButton = page.locator(selectors.checkout.shippingContinueButton).first()
			try {
				await shippingButton.waitFor({ state: 'visible', timeout: innerTimeout })
			} catch {
				throw Object.assign(new Error('Shipping continue button not visible'), { code: 'TIMEOUT' })
			}

			await naturalClick(page, shippingButton)

			// Wait for payment section to confirm shipping is complete.
			await page.waitForSelector(selectors.checkout.paymentSection, { timeout: innerTimeout })

			return formEmpty ? 'shipping-filled-and-complete' : 'shipping-complete'
		},
		timeoutMs,
	)
}
