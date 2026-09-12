// Normalise the many proxy string shapes users paste into accounts.csv into a
// proper URL, so non-technical users don't have to hand-add a scheme or reorder
// fields. Dependency-free (no playwright import) so config schemas can use it.
//
// Accepts:
//   http://user:pass@host:port   (already a URL — used as-is)
//   socks5://host:port
//   host:port:user:pass          (WebShare CSV export format) → http://user:pass@host:port
//   host:port                    (no auth)                    → http://host:port

export function normalizeProxyInput(raw: string): string {
	const value = raw.trim()
	if (value === '') return value
	// Already a URL (has a scheme like http://, socks5://).
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value

	const parts = value.split(':')
	const isPort = (s: string | undefined) => !!s && /^\d+$/.test(s)

	// host:port:user:pass  (WebShare export). Password may be empty but present.
	if (parts.length === 4 && isPort(parts[1])) {
		const [host, port, user, pass] = parts
		return `http://${encodeURIComponent(user ?? '')}:${encodeURIComponent(pass ?? '')}@${host}:${port}`
	}
	// host:port:user  (rare — no password).
	if (parts.length === 3 && isPort(parts[1])) {
		const [host, port, user] = parts
		return `http://${encodeURIComponent(user ?? '')}@${host}:${port}`
	}
	// host:port  (no auth).
	if (parts.length === 2 && isPort(parts[1])) {
		return `http://${value}`
	}
	// Unrecognised shape (e.g. a bare word with no port) → return unchanged so
	// downstream URL validation rejects it with a clear error.
	return value
}
