// cardMatcher — pure helpers to decide whether the saved payment card shown on
// Nike's checkout is the card the operator configured. Nike never exposes a full
// PAN in the DOM (PCI), only a masked tail like "•••• 1234" / "se terminant par
// 1234" / "ending in 1234". We compare on the last 4 digits.
//
// Pure + dependency-free → unit-testable without a browser.

/** Last 4 digits of a card number (strips spaces/dashes/dots). */
export function cardLast4(cardNumber: string): string {
	const digits = cardNumber.replace(/\D/g, '')
	return digits.slice(-4)
}

/**
 * Does the masked-card text displayed on the checkout reference the target
 * card's last 4 digits?
 *
 * Looks for the target's last4 appearing as the trailing 4-digit group of a
 * masked number (e.g. "•••• 1234", "····1234", "se terminant par 1234",
 * "ending in 1234", "x-1234"). Requires the 4 digits to be bounded so we don't
 * match them mid-sequence inside an unrelated number.
 */
export function displayedCardMatches(displayedText: string, targetCardNumber: string): boolean {
	const last4 = cardLast4(targetCardNumber)
	if (last4.length !== 4) return false
	// Normalise common mask glyphs + words to spaces, then look for the last4 as
	// a standalone 4-digit group.
	const norm = displayedText
		.replace(/[•·*●‧∙]/g, ' ')
		.replace(/\b(?:se\s+terminant\s+par|ending\s+in|terminée?\s+par|finissant\s+par)\b/gi, ' ')
		.replace(/[^0-9]+/g, ' ')
		.trim()
	const groups = norm.split(' ').filter(Boolean)
	return groups.includes(last4)
}
