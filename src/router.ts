import { createRouter } from '@nanostores/router'

import { inputDictionary } from './utils/inputDictionary.js'

const { HOME, COUNTRY } = inputDictionary

export const router = createRouter({
  [COUNTRY.routeName]: COUNTRY.url,
  [HOME.routeName]: HOME.url,
})
