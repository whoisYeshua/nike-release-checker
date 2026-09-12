const ALIASES: Record<string, string> = { UK: 'GB' }

export function normalizeCountryCode(input: string): string {
	const upper = input.trim().toUpperCase()
	return ALIASES[upper] ?? upper
}
