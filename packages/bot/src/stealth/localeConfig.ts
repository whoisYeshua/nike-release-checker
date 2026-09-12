export interface LocaleConfig {
	locale: string
	timezoneId: string
	geolocation: { latitude: number; longitude: number }
	extraHTTPHeaders: Record<string, string>
}

const MARKET_LOCALES: Record<string, LocaleConfig> = {
	FR: {
		locale: 'fr-FR',
		timezoneId: 'Europe/Paris',
		geolocation: { latitude: 48.8566, longitude: 2.3522 },
		extraHTTPHeaders: {
			'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
		},
	},
	// Phase 3: DE, IT, ES, UK, US
}

/**
 * Builds a LocaleConfig for the given market.
 *
 * @param market - ISO 3166-1 alpha-2 market code (e.g. 'FR')
 * @param _language - Reserved for Phase 3 multi-language markets (e.g. 'CH' → 'fr' or 'de')
 * @throws if the market is not supported
 */
export function buildLocaleConfig(market: string, _language?: string): LocaleConfig {
	const key = market.toUpperCase()
	const config = Object.hasOwn(MARKET_LOCALES, key) ? MARKET_LOCALES[key] : undefined
	if (!config) {
		throw new Error(
			`Unsupported market: '${market}'. Supported markets: ${Object.keys(MARKET_LOCALES).join(', ')}`,
		)
	}
	// Return a shallow clone to prevent callers from mutating the shared singleton
	return {
		...config,
		geolocation: { ...config.geolocation },
		extraHTTPHeaders: { ...config.extraHTTPHeaders },
	}
}
