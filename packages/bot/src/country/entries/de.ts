import type { Country } from '../types.ts'

export const DE: Country = Object.freeze<Country>({
	code: 'DE',
	name: 'Germany',
	currency: 'EUR',
	locale: 'de-DE',
	languageCode: 'de',
	defaultPhonePrefix: '+49',
	phonePattern: /^\+49\d{10,11}$/,
	zipPattern: /^\d{5}$/,
	addressFields: ['street', 'city', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'de_DE',
	selectorOverridePath: 'selectors/DE.yaml',
	enabled: false,
})
