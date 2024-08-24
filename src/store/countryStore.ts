import { persistentAtom } from '@nanostores/persistent'
import { computed } from 'nanostores'

import { router } from '../router.ts'
import { countries } from '../utils/countries.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'

import type { CountryInfo, CountryCode } from '../utils/countries.ts'

const { HOME, COUNTRY } = inputDictionary

export const countryStore = persistentAtom<CountryInfo | null>('country', null, {
	encode: JSON.stringify,
	decode: JSON.parse,
})

export const setCountry = (countryCode: CountryCode) => {
	const targetCountry = countries.find(({ code }) => countryCode === code)
	if (!targetCountry) return

	countryStore.set(targetCountry)
	router.open(HOME.url)
}

export const resetCountry = () => {
	countryStore.set(null)
	router.open(COUNTRY.url)
}

export const readableCountry = computed(countryStore, (countryObj) =>
	countryObj ? countryObj.name : 'Not Selected'
)
