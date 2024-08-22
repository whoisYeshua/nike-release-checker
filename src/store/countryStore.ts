import { atom, computed } from 'nanostores'

import { router } from '../router.js'
import { countries } from '../utils/countries.js'
import { inputDictionary } from '../utils/inputDictionary.js'

import type { CountryInfo } from '../types/CountryInfo.js'

const { HOME, COUNTRY } = inputDictionary

export const countryStore = atom<CountryInfo | null>(null)

export const setCountry = (countryKey: keyof typeof countries) => {
  countryStore.set(countries[countryKey])
  router.open(HOME.url)
}

export const resetCountry = () => {
  countryStore.set(null)
  router.open(COUNTRY.url)
}

export const readableCountry = computed(countryStore, countryObj =>
  countryObj ? countryObj.country : 'Not Selected'
)
