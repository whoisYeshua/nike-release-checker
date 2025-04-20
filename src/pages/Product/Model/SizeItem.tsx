import { Box, Text } from 'ink'

import type { Level } from '#snkrs-sdk'
import type { TextProps } from 'ink'

interface SizeItemProps {
	size: string
	stock: Level
}

const stockColorMap = {
	HIGH: 'green',
	MEDIUM: 'yellow',
	LOW: 'red',
	OOS: 'gray',
} satisfies Record<Level, TextProps['color']>

export const SizeItem = ({ size, stock }: SizeItemProps) => {
	const color = stockColorMap[stock] ?? 'gray'
	const bold = color === 'green'

	return (
		<Box>
			<Box width={5}>
				<Text color={color} bold={bold}>
					{size}
				</Text>
			</Box>
			<Box>
				<Text color={color} bold={bold}>
					- {stock}
				</Text>
			</Box>
		</Box>
	)
}
