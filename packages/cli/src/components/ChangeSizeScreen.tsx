import { Box, Text } from 'ink'

type ChangeSizeScreenProps = {
	currentHeight: number
	minHeight: number
}

export const ChangeSizeScreen = ({ currentHeight, minHeight }: ChangeSizeScreenProps) => {
	const heightDifference = minHeight - currentHeight

	return (
		<Box
			flexDirection="column"
			justifyContent="flex-end"
		>
			<Text bold color="yellow">
				CHANGE TERMINAL\WINDOW HEIGHT
			</Text>
			<Text>
				Current height:{' '}
				<Text color="red" bold>
					{currentHeight}
				</Text>
			</Text>
			<Text>
				Minimum required height:{' '}
				<Text color="green" bold>
					{minHeight}
				</Text>
			</Text>
			<Text>
				You should increase the height by <Text underline>{heightDifference}</Text>{' '}
				lines
			</Text>
		</Box>
	)
}
