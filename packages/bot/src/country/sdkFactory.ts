import type { AvailableCountry } from '@nike-release-checker/sdk'
import type { Country } from './types.ts'

// ---------------------------------------------------------------------------
// Currency lookup by country code (ISO 4217)
// ---------------------------------------------------------------------------
const CURRENCY_BY_CODE: Record<string, string> = {
	// Eurozone
	AT: 'EUR', BE: 'EUR', BG: 'EUR', HR: 'EUR', CY: 'EUR', CZ: 'EUR',
	DK: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR', GR: 'EUR',
	HU: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR',
	MT: 'EUR', NL: 'EUR', PL: 'EUR', PT: 'EUR', RO: 'EUR', SK: 'EUR',
	SI: 'EUR', ES: 'EUR',
	// Non-euro EU / European
	NO: 'NOK',
	SE: 'SEK',
	CH: 'CHF',
	RU: 'RUB',
	TR: 'TRY',
	// Americas
	US: 'USD',
	CA: 'CAD',
	MX: 'MXN',
	CL: 'CLP',
	UY: 'UYU',
	PR: 'USD',
	// APAC
	JP: 'JPY',
	KR: 'KRW',
	CN: 'CNY',
	TW: 'TWD',
	AU: 'AUD',
	NZ: 'NZD',
	IN: 'INR',
	ID: 'IDR',
	MY: 'MYR',
	PH: 'PHP',
	SG: 'SGD',
	TH: 'THB',
	VN: 'VND',
	// GB
	GB: 'GBP',
	// Middle East / Africa
	AE: 'AED',
	SA: 'SAR',
	IL: 'ILS',
	EG: 'EGP',
	MA: 'MAD',
	ZA: 'ZAR',
}

// ---------------------------------------------------------------------------
// Phone prefix lookup by country code (E.164 country dial codes)
// ---------------------------------------------------------------------------
const PHONE_PREFIX_BY_CODE: Record<string, string> = {
	AU: '+61', AT: '+43', BE: '+32', BG: '+359', CA: '+1',
	CL: '+56', CN: '+86', HR: '+385', CZ: '+420', DK: '+45',
	EG: '+20', FI: '+358', FR: '+33', DE: '+49', GR: '+30',
	HU: '+36', IN: '+91', ID: '+62', IE: '+353', IL: '+972',
	IT: '+39', JP: '+81', KR: '+82', LU: '+352', MY: '+60',
	MX: '+52', MA: '+212', NL: '+31', NZ: '+64', NO: '+47',
	PH: '+63', PL: '+48', PR: '+1', PT: '+351', RO: '+40',
	RU: '+7', SA: '+966', SG: '+65', SK: '+421', SI: '+386',
	ZA: '+27', ES: '+34', SE: '+46', CH: '+41', TW: '+886',
	TH: '+66', TR: '+90', AE: '+971', GB: '+44', US: '+1',
	UY: '+598', VN: '+84',
}

// ---------------------------------------------------------------------------
// Locale normalisation
// SDK languages like 'de', 'fr', 'en-GB', 'zh-Hans', 'es-419' need mapping
// to valid /^[a-z]{2}-[A-Z]{2}$/ patterns.
// ---------------------------------------------------------------------------
const LOCALE_OVERRIDE: Record<string, string> = {
	// SDK value → normalized locale
	'zh-Hans': 'zh-CN',
	'zh-Hant': 'zh-TW',
	'es-419': 'es-419',  // not valid per schema — handled below per code
	'en-GB': 'en-GB',
	'en': 'en-US',
	'de': 'de-DE',
	'fr': 'fr-FR',
	'it': 'it-IT',
	'nl': 'nl-NL',
	'es-ES': 'es-ES',
	'pt-PT': 'pt-PT',
	'ja': 'ja-JP',
	'ko': 'ko-KR',
	'ru': 'ru-RU',
	'pl': 'pl-PL',
	'cs': 'cs-CZ',
	'da': 'da-DK',
	'no': 'nb-NO',
	'sv': 'sv-SE',
	'fi': 'fi-FI',
	'el': 'el-GR',
	'tr': 'tr-TR',
	'th': 'th-TH',
	'zh': 'zh-CN',
}

// per-code locale overrides for languages that don't map cleanly
const LOCALE_BY_CODE: Record<string, string> = {
	CL: 'es-CL',
	MX: 'es-MX',
	PR: 'es-PR',
	UY: 'es-UY',
	BG: 'bg-BG',
	HR: 'hr-HR',
	HU: 'hu-HU',
	RO: 'ro-RO',
	SK: 'sk-SK',
	SI: 'sl-SI',
	FI: 'fi-FI',
	IN: 'en-IN',
	ID: 'id-ID',
	IE: 'en-IE',
	IL: 'he-IL',
	MY: 'ms-MY',
	NZ: 'en-NZ',
	PH: 'en-PH',
	SA: 'ar-SA',
	AE: 'ar-AE',
	SG: 'en-SG',
	ZA: 'en-ZA',
	EG: 'ar-EG',
	MA: 'ar-MA',
	LU: 'lb-LU',
	VN: 'vi-VN',
	TW: 'zh-TW',
	CN: 'zh-CN',
	CA: 'en-CA',
	AU: 'en-AU',
	GB: 'en-GB',
	US: 'en-US',
	CH: 'de-CH',
}

// Language code: first two chars, but normalise special cases
const LANG_CODE_OVERRIDES: Record<string, string> = {
	'zh-Hans': 'zh',
	'zh-Hant': 'zh',
	'es-419': 'es',
	'es-ES': 'es',
	'pt-PT': 'pt',
	'en-GB': 'en',
	'nb-NO': 'nb',
}

function resolveLocale(sdkLanguage: string, code: string): string {
	if (LOCALE_BY_CODE[code]) return LOCALE_BY_CODE[code]
	if (LOCALE_OVERRIDE[sdkLanguage]) return LOCALE_OVERRIDE[sdkLanguage]
	// try to construct xx-XX from two-letter language
	if (/^[a-z]{2}$/.test(sdkLanguage)) {
		return `${sdkLanguage}-${code}`
	}
	// fallback
	return 'en-GB'
}

function resolveLanguageCode(sdkLanguage: string): string {
	if (LANG_CODE_OVERRIDES[sdkLanguage]) return LANG_CODE_OVERRIDES[sdkLanguage]
	return sdkLanguage.split('-')[0]?.slice(0, 2) ?? 'en'
}

// ---------------------------------------------------------------------------
// Determine whether the description implies no feed support
// ---------------------------------------------------------------------------
const DISABLED_DESCRIPTIONS = new Set([
	'Disabled',
	'No SNKRS',
	'Not supported currently',
])

function isFeedSupported(description: string): boolean {
	return !DISABLED_DESCRIPTIONS.has(description)
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function defaultCountryFromSdk(entry: AvailableCountry): Country {
	const code = entry.code
	const locale = resolveLocale(entry.language, code)
	const languageCode = resolveLanguageCode(entry.language)
	const currency = CURRENCY_BY_CODE[code] ?? 'USD'
	const defaultPhonePrefix = PHONE_PREFIX_BY_CODE[code] ?? '+1'
	// Adyen locale: languageCode_CODE  (must match /^[a-z]{2}_[A-Z]{2}$/)
	const adyenIframeLocale = `${languageCode}_${code}`

	return Object.freeze<Country>({
		code,
		name: entry.name,
		currency,
		locale,
		languageCode,
		defaultPhonePrefix,
		phonePattern: /^\+?\d{6,15}$/,
		zipPattern: /.+/,
		addressFields: ['street', 'city', 'zip', 'country'],
		adyenIframeLocale,
		selectorOverridePath: null,
		enabled: false,
		description: entry.description || undefined,
		feedSupported: isFeedSupported(entry.description),
	})
}
