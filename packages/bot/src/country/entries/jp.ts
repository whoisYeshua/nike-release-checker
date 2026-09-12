import type { Country } from '../types.ts'

export const JP: Country = Object.freeze<Country>({
	code: 'JP',
	name: 'Japan',
	currency: 'JPY',
	locale: 'ja-JP',
	languageCode: 'ja',
	defaultPhonePrefix: '+81',
	phonePattern: /^\+81\d{9,10}$/,
	zipPattern: /^\d{3}-\d{4}$/,
	addressFields: ['zip', 'city', 'street', 'country'] as Country['addressFields'],
	adyenIframeLocale: 'ja_JP',
	selectorOverridePath: 'selectors/JP.yaml',
	enabled: false,
})
