import type { Country } from '../types.ts'

export const US: Country = Object.freeze<Country>({
	code: 'US',
	name: 'United States',
	currency: 'USD',
	locale: 'en-US',
	languageCode: 'en',
	defaultPhonePrefix: '+1',
	phonePattern: /^\+1\d{10}$/,
	zipPattern: /^\d{5}(-\d{4})?$/,
	addressFields: ['street', 'street2', 'city', 'state', 'zip', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'en_US',
	selectorOverridePath: 'selectors/US.yaml',
	enabled: false,
})
