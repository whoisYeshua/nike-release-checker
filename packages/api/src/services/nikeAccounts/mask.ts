/**
 * Email masking helper — Story 16.4
 *
 * maskEmail("john.smith@gmail.com") → "j***@gmail.com"
 * Format: first char + "***" + "@domain"
 */

export function maskEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx <= 0) return '***'
  const firstChar = email[0]!
  const domain = email.slice(atIdx)
  return `${firstChar}***${domain}`
}
