/**
 * Masks sensitive credentials in strings before logging or display.
 * Emails: user@example.com → u***@example.com
 * Proxy URLs: any scheme — http/https/socks5/etc. → scheme://u***:***@host:port
 * Passwords: never logged — callers must not pass raw passwords
 */

export function maskEmail(email: string): string {
	const atIndex = email.indexOf('@')
	if (atIndex <= 0) return '***'
	return `${email[0]}***@${email.slice(atIndex + 1)}`
}

export function maskProxy(proxyUrl: string): string {
	// Match any scheme (http, https, socks5, socks4, etc.) with user:pass@host or user@host
	return proxyUrl.replace(
		/^([a-z][a-z0-9+.-]*:\/\/)([^:@]+)(?::([^@]+))?@/,
		(_match, protocol, _user, pass) => `${protocol}u***${pass !== undefined ? ':***' : ''}@`,
	)
}

export function maskCredentials(text: string): string {
	// Mask email-like patterns
	let masked = text.replace(/\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, (_m, local, domain) => {
		return `${local[0]}***@${domain}`
	})
	// Mask proxy credentials in any scheme
	masked = masked.replace(
		/([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+)(?::([^@/\s]+))?@/g,
		(_match, protocol, _user, pass) => {
			return `${protocol}u***${pass !== undefined ? ':***' : ''}@`
		},
	)
	return masked
}
