import figures from 'figures'
import { Box, Text } from 'ink'

import { theme } from '../../utils/theme.ts'

export type SelectIndicatorProps = {
	readonly isSelected?: boolean
}

export const SelectIndicator = ({ isSelected = false }: SelectIndicatorProps) => {
	return (
		<Box marginRight={1}>
			{isSelected ? <Text color={theme.color.snkrsRed}>{figures.pointer}</Text> : <Text> </Text>}
		</Box>
	)
}
