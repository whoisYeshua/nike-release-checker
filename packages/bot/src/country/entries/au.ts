import type { Country } from '../types.ts'

export const AU: Country = Object.freeze<Country>({
	code: 'AU',
	name: 'Australia',
	currency: 'AUD',
	locale: 'en-AU',
	languageCode: 'en',
	defaultPhonePrefix: '+61',
	phonePattern: /^\+61[2-9]\d{8}$/,
	zipPattern: /^\d{4}$/,
	addressFields: ['street', 'city', 'state', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'en_AU',
	selectorOverridePath: 'selectors/AU.yaml',
	enabled: false,
})
