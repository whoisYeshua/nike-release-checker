import type { Country } from '../types.ts'

export const FR: Country = Object.freeze<Country>({
	code: 'FR',
	name: 'France',
	currency: 'EUR',
	locale: 'fr-FR',
	languageCode: 'fr',
	defaultPhonePrefix: '+33',
	phonePattern: /^\+33[1-9]\d{8}$/,
	zipPattern: /^\d{5}$/,
	addressFields: ['street', 'city', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'fr_FR',
	selectorOverridePath: null,
	enabled: true,
})
