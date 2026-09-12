export type LoginFailureReason = 'blocked' | 'invalid_credentials' | 'timeout' | 'error'

export interface ProxyTestResult {
	success: boolean
	latencyMs: number
	error?: string
}

export interface AccountImportError {
	accountId: string
	reason: string
}

export interface ImportResult {
	imported: number
	failed: number // schema-invalid + dedup-skipped + proxy-failed (all non-imported)
	errors: AccountImportError[]
	processedAccounts: Array<{ id: string; email: string; proxy?: string }>
}

export interface LoginResult {
	success: boolean
	error?: string
	failureReason?: LoginFailureReason
	durationMs: number
}

export interface AuthResult {
	accountId: string
	success: boolean
	error?: string
	failureReason?: LoginFailureReason
	durationMs: number
}

export type SessionStatus = 'valid' | 'expired' | 'missing'

export interface SessionValidationResult {
	status: SessionStatus
	error?: string
	lastLogin?: Date
	expiresAt?: number
	expiredAt?: number
	domainCount?: number
}

export interface AccountStatusRow {
	id: string
	email: string
	country: string
	proxy?: string
	session: SessionValidationResult
	preferredSizes?: string[]
}

export interface CookieData {
	name: string
	value: string
	domain: string
	path: string
	expires: number
	httpOnly: boolean
	secure: boolean
	sameSite?: 'Strict' | 'Lax' | 'None'
}
