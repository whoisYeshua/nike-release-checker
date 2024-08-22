import { atom, computed } from 'nanostores'

import { router } from '../router'
import { countries } from '../utils/countries'
import { inputDictionary } from '../utils/inputDictionary'

import { countryInfoSchema, type CountryInfo } from '../models/CountryInfo'
import { db } from '../utils/db'

const { HOME, COUNTRY } = inputDictionary
const DB_CONUTRY_KEY = 'country_info'

const getInitialValueFromDb = async () => {
  const initialValue = await db.get(DB_CONUTRY_KEY)
  const res = countryInfoSchema.safeParse(initialValue)
  if (res.success) return res.data
  return null
}

const initialValue = await getInitialValueFromDb()
export const countryStore = atom<CountryInfo | null>(initialValue)

export const setCountry = (countryKey: keyof typeof countries) => {
  const countryInfo = countries[countryKey]
  countryStore.set(countryInfo)
  router.open(HOME.url)
}

export const resetCountry = () => {
  countryStore.set(null)
  router.open(COUNTRY.url)
}

export const readableCountry = computed(countryStore, countryObj =>
  countryObj ? countryObj.country : 'Not Selected'
)

countryStore.subscribe(async value => {
  await db.set(DB_CONUTRY_KEY, value)
})
