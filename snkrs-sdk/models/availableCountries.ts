export const availableCountries = [
	{ code: 'AU', name: 'Australia', description: '', language: 'en-GB', emoji: '🇦🇺' },
	{ code: 'AT', name: 'Austria', description: '', language: 'de', emoji: '🇦🇹' },
	{ code: 'BE', name: 'Belgium', description: '', language: 'de', emoji: '🇧🇪' },
	{ code: 'BG', name: 'Bulgaria', description: '', language: 'en-GB', emoji: '🇧🇬' },
	{ code: 'CA', name: 'Canada', description: '', language: 'en-GB', emoji: '🇨🇦' },
	{
		code: 'CL',
		name: 'Chile',
		description: 'Not supported currently',
		language: 'es-419',
		emoji: '🇨🇱'
	}, // No dedicated API; only HTML pages are available. Not supported currently.
	{ code: 'CN', name: 'China', description: '', language: 'zh-Hans', emoji: '🇨🇳' },
	{ code: 'HR', name: 'Croatia', description: '', language: 'en-GB', emoji: '🇭🇷' },
	{ code: 'CZ', name: 'Czechia', description: '', language: 'cs', emoji: '🇨🇿' },
	{ code: 'DK', name: 'Denmark', description: '', language: 'da', emoji: '🇩🇰' },
	{ code: 'EG', name: 'Egypt', description: 'No SNKRS', language: 'en-GB', emoji: '🇪🇬' },
	{ code: 'FI', name: 'Finland', description: '', language: 'en-GB', emoji: '🇫🇮' },
	{ code: 'FR', name: 'France', description: '', language: 'fr', emoji: '🇫🇷' },
	{ code: 'DE', name: 'Germany', description: '', language: 'de', emoji: '🇩🇪' },
	{ code: 'GR', name: 'Greece', description: '', language: 'el', emoji: '🇬🇷' },
	{ code: 'HU', name: 'Hungary', description: '', language: 'en-GB', emoji: '🇭🇺' },
	{ code: 'IN', name: 'India', description: '', language: 'en-GB', emoji: '🇮🇳' },
	{ code: 'ID', name: 'Indonesia', description: '', language: 'en-GB', emoji: '🇮🇩' },
	{ code: 'IE', name: 'Ireland', description: '', language: 'en-GB', emoji: '🇮🇪' },
	{ code: 'IL', name: 'Israel', description: '', language: 'en-GB', emoji: '🇮🇱' },
	{ code: 'IT', name: 'Italy', description: '', language: 'it', emoji: '🇮🇹' },
	{ code: 'JP', name: 'Japan', description: '', language: 'ja', emoji: '🇯🇵' },
	{ code: 'KR', name: 'Korea', description: '', language: 'ko', emoji: '🇰🇷' },
	{ code: 'LU', name: 'Luxembourg', description: '', language: 'en-GB', emoji: '🇱🇺' },
	{ code: 'MY', name: 'Malaysia', description: '', language: 'en-GB', emoji: '🇲🇾' },
	{ code: 'MX', name: 'Mexico', description: '', language: 'es-419', emoji: '🇲🇽' },
	{ code: 'MA', name: 'Morocco', description: 'No SNKRS', language: 'en-GB', emoji: '🇲🇦' },
	{ code: 'NL', name: 'Netherlands', description: '', language: 'nl', emoji: '🇳🇱' },
	{ code: 'NZ', name: 'New Zealand', description: '', language: 'en-GB', emoji: '🇳🇿' },
	{ code: 'NO', name: 'Norway', description: '', language: 'no', emoji: '🇳🇴' },
	{ code: 'PH', name: 'Philippines', description: '', language: 'en-GB', emoji: '🇵🇭' },
	{ code: 'PL', name: 'Poland', description: '', language: 'pl', emoji: '🇵🇱' },
	{ code: 'PR', name: 'Puerto Rico', description: 'No SNKRS', language: 'es-419', emoji: '🇵🇷' },
	{ code: 'PT', name: 'Portugal', description: '', language: 'pt-PT', emoji: '🇵🇹' },
	{ code: 'RO', name: 'Romania', description: '', language: 'en-GB', emoji: '🇷🇴' },
	{ code: 'RU', name: 'Russia', description: 'Disabled', language: 'ru', emoji: '🇷🇺' },
	{ code: 'SA', name: 'Saudi Arabia', description: '', language: 'en-GB', emoji: '🇸🇦' },
	{ code: 'SG', name: 'Singapore', description: '', language: 'en-GB', emoji: '🇸🇬' },
	{ code: 'SK', name: 'Slovakia', description: '', language: 'en-GB', emoji: '🇸🇰' },
	{ code: 'SI', name: 'Slovenia', description: '', language: 'en-GB', emoji: '🇸🇮' },
	{ code: 'ZA', name: 'South Africa', description: '', language: 'en-GB', emoji: '🇿🇦' },
	{ code: 'ES', name: 'Spain', description: '', language: 'es-ES', emoji: '🇪🇸' },
	{ code: 'SE', name: 'Sweden', description: '', language: 'sv', emoji: '🇸🇪' },
	{ code: 'CH', name: 'Switzerland', description: '', language: 'en-GB', emoji: '🇨🇭' },
	{ code: 'TW', name: 'Taiwan', description: '', language: 'zh-Hant', emoji: '🇹🇼' },
	{ code: 'TH', name: 'Thailand', description: '', language: 'th', emoji: '🇹🇭' },
	{ code: 'TR', name: 'Turkey', description: '', language: 'tr', emoji: '🇹🇷' },
	{ code: 'AE', name: 'United Arab Emirates', description: '', language: 'en-GB', emoji: '🇦🇪' },
	{ code: 'GB', name: 'United Kingdom', description: '', language: 'en-GB', emoji: '🇬🇧' },
	{ code: 'US', name: 'United States', description: '', language: 'en', emoji: '🇺🇸' },
	{ code: 'UY', name: 'Uruguay', description: '', language: 'es-419', emoji: '🇺🇾' },
	{
		code: 'VN',
		name: 'Vietnam',
		description: 'Check Thailand for SNKRS data',
		language: 'en-GB',
		emoji: '🇻🇳'
	} // Looks like SNKRS redirect to Thailand
] as const satisfies AvailableCountry[]

export interface AvailableCountry {
	code: string
	name: string
	description: string
	language: string
	emoji: string
}

export type CountryCode = (typeof availableCountries)[number]['code']
export type CountryLanguage = (typeof availableCountries)[number]['language']
