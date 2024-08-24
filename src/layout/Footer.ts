import { createElement } from 'react'
import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'

import { router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'

const { COUNTRY } = inputDictionary

export const Footer = () => {
	const page = useStore(router)

	return createElement(
		Box,
		{ borderStyle: 'round', paddingLeft: 1, paddingRight: 1, justifyContent: 'space-between' },
		createElement(Box, null, page?.route !== COUNTRY.routeName && resetCountryElement),
		madeByElement
	)
}

const resetCountryElement = createElement(Text, null, `[${COUNTRY.key}] - Reset Country`)
const madeByElement = createElement(Text, { color: 'gray', italic: true }, 'Made by @whoisYeshua')
