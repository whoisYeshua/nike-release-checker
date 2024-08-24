import { useInput } from 'ink'

import { router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { resetCountry } from '../store/countryStore.ts'

const { HOME, COUNTRY } = inputDictionary

export const useInputProcess = () => {
	useInput((input) => {
		if (input === HOME.key) router.open(HOME.url)
		else if (input === COUNTRY.key) resetCountry()
	})
}
