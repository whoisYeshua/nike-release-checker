import { useInput } from 'ink'

import { $router } from '../router.ts'
import { $country } from '../store/country.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'

const { HOME, COUNTRY } = inputDictionary

export const useInputProcess = () => {
	useInput((input) => {
		if (input === HOME.key) $router.open(HOME.url)
		else if (input === COUNTRY.key) $country.reset()
	})
}
