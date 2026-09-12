import type { Country } from '../types.ts'

export const IT: Country = Object.freeze<Country>({
	code: 'IT',
	name: 'Italy',
	currency: 'EUR',
	locale: 'it-IT',
	languageCode: 'it',
	defaultPhonePrefix: '+39',
	phonePattern: /^\+39\d{9,10}$/,
	zipPattern: /^\d{5}$/,
	addressFields: ['street', 'city', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'it_IT',
	selectorOverridePath: 'selectors/IT.yaml',
	enabled: false,
})
