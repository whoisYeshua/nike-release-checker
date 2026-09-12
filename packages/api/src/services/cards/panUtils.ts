/**
 * PAN helper utilities — Story 16.3
 *
 * Luhn validation, brand detection via IIN prefix,
 * last-4 extraction, and holder-name masking.
 * These helpers are pure functions with no external dependencies.
 */

/**
 * Validate a PAN string using the Luhn algorithm.
 * Accepts spaces/dashes as separators; ignores them before checking.
 */
export function isLuhnValid(pan: string): boolean {
  const digits = pan.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(digits) || digits.length < 13) return false
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

/** Supported card brands. */
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown'

/**
 * Infer card brand from IIN (first 6 digits) prefix rules.
 */
export function inferBrand(pan: string): CardBrand {
  const digits = pan.replace(/[\s-]/g, '')
  if (/^4/.test(digits)) return 'visa'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard'
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^(6011|65|64[4-9]|622)/.test(digits)) return 'discover'
  return 'unknown'
}

/**
 * Return the trailing 4 digits of a PAN (spaces/dashes stripped).
 */
export function last4(pan: string): string {
  const digits = pan.replace(/[\s-]/g, '')
  return digits.slice(-4)
}

/**
 * Mask a card holder name as "First I." (first name + first initial of surname).
 * Examples:
 *   "John Doe"       → "John D."
 *   "Mary Jane Smith"→ "Mary J."  (uses first two tokens only)
 *   "Madonna"        → "Madonna"  (no surname)
 */
export function maskHolder(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2 || parts[1] === undefined) return name.trim()
  return `${parts[0]} ${parts[1][0]!.toUpperCase()}.`
}
