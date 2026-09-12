import type { Country } from '../types.ts'

export const GB: Country = Object.freeze<Country>({
	code: 'GB',
	name: 'United Kingdom',
	currency: 'GBP',
	locale: 'en-GB',
	languageCode: 'en',
	defaultPhonePrefix: '+44',
	phonePattern: /^\+44\d{10}$/,
	zipPattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
	addressFields: ['street', 'street2', 'city', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'en_GB',
	selectorOverridePath: 'selectors/GB.yaml',
	enabled: false,
})
