import { useInput } from 'ink'

import { router } from '../router.js'
import { inputDictionary } from '../utils/inputDictionary.js'
import { resetCountry } from '../store/countryStore.js'

const { HOME, COUNTRY } = inputDictionary

export const useInputProcess = () => {
  useInput(input => {
    if (input === HOME.key) router.open(HOME.url)
    if (input === COUNTRY.key) resetCountry()
  })
}
