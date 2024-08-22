import { useInput } from 'ink'

import { router } from '../router'
import { inputDictionary } from '../utils/inputDictionary'
import { resetCountry } from '../store/countryStore'

const { HOME, COUNTRY } = inputDictionary

export const useInputProcess = () => {
  useInput(input => {
    if (input === HOME.key) router.open(HOME.url)
    if (input === COUNTRY.key) resetCountry()
  })
}
