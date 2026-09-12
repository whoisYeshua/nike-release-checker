import type { Country } from '../types.ts'

export const NL: Country = Object.freeze<Country>({
	code: 'NL',
	name: 'Netherlands',
	currency: 'EUR',
	locale: 'nl-NL',
	languageCode: 'nl',
	defaultPhonePrefix: '+31',
	phonePattern: /^\+31[1-9]\d{8}$/,
	zipPattern: /^\d{4}\s?[A-Z]{2}$/,
	addressFields: ['street', 'city', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'nl_NL',
	selectorOverridePath: 'selectors/NL.yaml',
	enabled: false,
})
