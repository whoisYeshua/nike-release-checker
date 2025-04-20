import { createRouter } from '@nanostores/router'

import { inputDictionary } from './utils/inputDictionary.ts'

const { HOME, COUNTRY, PRODUCT } = inputDictionary

export const $router = createRouter({
	[COUNTRY.routeName]: COUNTRY.url,
	[HOME.routeName]: HOME.url,
	[PRODUCT.routeName]: PRODUCT.url,
})
