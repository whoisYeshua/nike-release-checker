import { useInput } from 'ink'

import { $router } from '../router.ts'
import { $country } from '../store/country.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { logger } from '../utils/logger.ts'

const { HOME, COUNTRY } = inputDictionary

export const useInputProcess = () => {
	useInput((input, key) => {
		logger.debug('input received', { scope: 'useInputProcess', input, key: Object.entries(key).filter(([, value]) => value === true).map(([value]) => value).join(', ') })
		if (input === HOME.key) $router.open(HOME.url)
		else if (input === COUNTRY.key) $country.reset()
	})
}
