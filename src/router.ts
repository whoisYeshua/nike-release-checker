import { createRouter } from '@nanostores/router'

import { inputDictionary } from './utils/inputDictionary.ts'

const { HOME, COUNTRY } = inputDictionary

export const router = createRouter({
	[COUNTRY.routeName]: COUNTRY.url,
	[HOME.routeName]: HOME.url,
})
