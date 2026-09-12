// Thin accounts stub for warmup coordinator — Story 17.5
// Mirrors the in-memory nikeAccountsStore in dispatchDrop.ts.
// When Epic 16 vault lands, replace with a real call to nikeAccountsRepository.

export interface WarmupAccountRow {
  id: string
  customer_id: string
}

const store: WarmupAccountRow[] = []

export function _getAccountsForCustomer(customerId: string): WarmupAccountRow[] {
  return store.filter((a) => a.customer_id === customerId)
}

export function _seedWarmupAccount(account: WarmupAccountRow): void {
  store.push(account)
}

export function _resetWarmupAccounts(): void {
  store.length = 0
}
