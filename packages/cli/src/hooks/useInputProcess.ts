import { useInput } from 'ink'

import { $router } from '../router.ts'
import { $country } from '../store/country.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { logger } from '../utils/logger.ts'

import type { Key } from 'ink'

const { HOME, COUNTRY } = inputDictionary

const filterKeys = (key: Key) => {
	return Object.entries(key)
		.filter(([, value]) => value === true)
		.map(([value]) => value)
		.join(', ')
}

/** Keyboard handling for the app; exported for unit tests without mounting Ink. */
export const handleKeyboardInput = (input: string, key: Key) => {
	logger.debug('input received', { scope: 'handleKeyboardInput', input, key: filterKeys(key) })
	if (input === HOME.key) $router.open(HOME.url)
	else if (input === COUNTRY.key) $country.reset()
}

export const useInputProcess = () => useInput(handleKeyboardInput)
