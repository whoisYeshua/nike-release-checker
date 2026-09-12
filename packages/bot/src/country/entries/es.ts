import type { Country } from '../types.ts'

export const ES: Country = Object.freeze<Country>({
	code: 'ES',
	name: 'Spain',
	currency: 'EUR',
	locale: 'es-ES',
	languageCode: 'es',
	defaultPhonePrefix: '+34',
	phonePattern: /^\+34[6-9]\d{8}$/,
	zipPattern: /^\d{5}$/,
	addressFields: ['street', 'city', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'es_ES',
	selectorOverridePath: 'selectors/ES.yaml',
	enabled: false,
})
