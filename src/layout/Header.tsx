import { useStore } from '@nanostores/react'
import { Box, Text } from 'ink'

import packageJson from '../../package.json' with { type: 'json' }
import { $country } from '../store/country.ts'
import { $selectedProductImage } from '../store/product.ts'
import { theme } from '../utils/theme.ts'

const { version } = packageJson

export const Header = () => {
	const country = useStore($country.readableValue)
	const selectedProductImage = useStore($selectedProductImage)
	const isImageShown = Boolean(selectedProductImage?.data)

	return (
		<Box
			borderStyle="round"
			paddingLeft={1}
			paddingRight={1}
			justifyContent="space-between"
			marginTop={isImageShown ? theme.sizes.image : 0}
		>
			<Box gap={1}>
				<Text color={theme.color.snkrsRed} bold>
					SNKRS CLI
				</Text>
				<Text color="gray" italic>
					V {version}
				</Text>
			</Box>
			<Box>
				<Text>Country: {country}</Text>
			</Box>
		</Box>
	)
}
