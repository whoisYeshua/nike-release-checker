import { createElement } from 'react'
import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'

import { readableCountry } from '../store/countryStore.ts'
import packageJson from '../../package.json' with { type: 'json' }

const { version } = packageJson

export const Header = () => {
	const country = useStore(readableCountry)

	return createElement(
		Box,
		{ borderStyle: 'round', paddingLeft: 1, paddingRight: 1, justifyContent: 'space-between' },
		createElement(Box, { gap: 1 }, appNameElement, appVersionElement),
		createElement(Box, null, createElement(Text, null, `Country: ${country}`))
	)
}

const appNameElement = createElement(Text, { color: '#FF5C7D', bold: true }, 'SNKRS CLI')
const appVersionElement = createElement(Text, { color: 'gray', italic: true }, `V ${version}`)
