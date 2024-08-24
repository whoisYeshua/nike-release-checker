import { createElement } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useStore } from '@nanostores/react'

import { countryStore } from '../store/countryStore.ts'
import { router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'

const { COUNTRY } = inputDictionary

export const Home = () => {
	const country = useStore(countryStore)
	const isLoading = true

	if (!country) {
		// use queueMicrotask for prevent error on change url before component render
		queueMicrotask(() => router.open(COUNTRY.url))
		return null
	}

	if (isLoading) return loadingElement

	return createElement(Box, { paddingLeft: 2 }, createElement(Text, null, 'HOME'))
}

const loadingElement = createElement(
	Box,
	null,
	createElement(Text, { color: '#FF5C7D' }, createElement(Spinner, { type: 'dots' })),
	createElement(Text, null, ' Loading')
)
