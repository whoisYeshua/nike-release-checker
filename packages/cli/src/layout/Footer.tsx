import { useStore } from '@nanostores/react'
import { Box, Text } from 'ink'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'

const { HOME, COUNTRY, PRODUCT } = inputDictionary

export const Footer = () => {
	const page = useStore($router)

	return (
		<Box borderStyle="round" paddingLeft={1} paddingRight={1} justifyContent="space-between">
			<Box gap={3}>
				{page?.route === PRODUCT.routeName && <Text>[{HOME.key}] - Home</Text>}
				{page?.route !== COUNTRY.routeName && <Text>[{COUNTRY.key}] - Reset Country</Text>}
			</Box>
			<Text color="gray" italic>
				Made by @whoisYeshua
			</Text>
		</Box>
	)
}
