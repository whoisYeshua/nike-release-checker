import { loadStoredAccounts } from './accountManager.ts'
import { validateSession } from './sessionValidator.ts'
import { maskEmail } from '../logger/credentialMasker.ts'

export interface SessionValidationResult {
  accountId: string
  email: string  // always masked
  valid: boolean
  reason?: 'no_session' | 'expired'
}

export async function validateAllSessions(): Promise<SessionValidationResult[]> {
  const accounts = await loadStoredAccounts()  // MUST await — async
  const settled = await Promise.allSettled(
    accounts.map(async (account) => {
      const maskedEmail = maskEmail(account.email)
      const sessionResult = await validateSession(account.id)
      if (sessionResult.status === 'missing') {
        return { accountId: account.id, email: maskedEmail, valid: false, reason: 'no_session' as const }
      }
      if (sessionResult.status === 'expired') {
        return { accountId: account.id, email: maskedEmail, valid: false, reason: 'expired' as const }
      }
      return { accountId: account.id, email: maskedEmail, valid: true }
    }),
  )
  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    // Validation threw unexpectedly — treat as invalid
    const account = accounts[i]!
    return {
      accountId: account.id,
      email: maskEmail(account.email),
      valid: false,
      reason: 'no_session' as const,
    }
  })
}

export function printValidationSummary(results: SessionValidationResult[]): void {
  const valid = results.filter((r) => r.valid).length
  const total = results.length
  console.log(`\nSession validation: ${valid}/${total} accounts have valid sessions`)
  for (const result of results) {
    if (result.valid) {
      console.log(`  ✓ ${result.email} — valid`)
    } else {
      console.log(`  ✗ ${result.email} — ${result.reason ?? 'invalid'}`)
    }
  }
  console.log()
}
