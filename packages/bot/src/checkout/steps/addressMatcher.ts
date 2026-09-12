// addressMatcher — pure helpers to decide whether a shipping address shown on
// Nike's checkout matches the address the operator configured in addresses.csv.
//
// Nike pre-selects a previously-saved address on a returning account. The bot
// must NOT blindly trust it: the operator may want a different address for this
// drop. These helpers normalise both sides and compare the load-bearing fields
// (street + postal code, with city as a tie-breaker) so completeShipping can
// decide to keep, switch, or add an address.
//
// Pure + dependency-free → unit-testable without a browser.

export interface TargetAddress {
	street: string
	city: string
	zip: string
	country?: string
	firstName?: string
	lastName?: string
}

/**
 * Normalise a free-text address fragment for comparison:
 * lowercase, strip accents, collapse whitespace, drop punctuation, and expand
 * the most common French street-type abbreviations so "10 r. de la paix" and
 * "10 Rue de la Paix" compare equal.
 */
export function normalizeAddressText(raw: string): string {
	let s = raw
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[.,;'’-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	// Common FR abbreviations → canonical form.
	const abbr: Array<[RegExp, string]> = [
		[/\bav\b/g, 'avenue'],
		[/\bave\b/g, 'avenue'],
		[/\bbd\b/g, 'boulevard'],
		[/\bblvd\b/g, 'boulevard'],
		[/\br\b/g, 'rue'],
		[/\bpl\b/g, 'place'],
		[/\bimp\b/g, 'impasse'],
		[/\ballee\b/g, 'allee'],
		[/\bch\b/g, 'chemin'],
	]
	for (const [re, full] of abbr) s = s.replace(re, full)
	return s.replace(/\s+/g, ' ').trim()
}

/** Extract digits only — postal codes and phone numbers compare on digits. */
export function digitsOnly(raw: string): string {
	return raw.replace(/\D/g, '')
}

/**
 * Does the address text currently displayed on the checkout match the target?
 *
 * Matching rule (deliberately lenient on formatting, strict on identity):
 *   - the target ZIP digits must appear in the displayed text, AND
 *   - the normalised street line must be a substring of the normalised display
 *     (Nike concatenates name/street/city/country into one block, so substring
 *     containment is the right test), OR the street's house-number + first
 *     significant token both appear.
 *
 * Returns true only when we're confident it's the same address.
 */
export function displayedAddressMatches(displayedText: string, target: TargetAddress): boolean {
	const display = normalizeAddressText(displayedText)
	const targetZip = digitsOnly(target.zip)
	if (targetZip.length > 0 && !digitsOnly(display).includes(targetZip)) {
		return false
	}
	const street = normalizeAddressText(target.street)
	if (street.length === 0) return false
	if (display.includes(street)) return true
	// Fallback: house number + the longest street token must both be present.
	const tokens = street.split(' ').filter((t) => t.length > 0)
	const houseNumber = tokens.find((t) => /^\d+$/.test(t))
	const longest = tokens
		.filter((t) => !/^\d+$/.test(t))
		.sort((a, b) => b.length - a.length)[0]
	if (houseNumber && longest) {
		return display.includes(houseNumber) && display.includes(longest)
	}
	return false
}
