import type { Country } from '../types.ts'

export const BE: Country = Object.freeze<Country>({
	code: 'BE',
	name: 'Belgium',
	currency: 'EUR',
	locale: 'fr-BE',
	languageCode: 'fr',
	defaultPhonePrefix: '+32',
	phonePattern: /^\+32[1-9]\d{7,8}$/,
	zipPattern: /^\d{4}$/,
	addressFields: ['street', 'city', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'fr_BE',
	selectorOverridePath: 'selectors/BE.yaml',
	enabled: false,
})
