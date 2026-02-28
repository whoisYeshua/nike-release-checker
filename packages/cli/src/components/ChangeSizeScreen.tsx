import { Box, Text } from 'ink'

type ChangeSizeScreenProps =
	| { dimension: 'height'; currentHeight: number; minHeight: number }
	| { dimension: 'width'; currentWidth: number; minWidth: number }

export const ChangeSizeScreen = (props: ChangeSizeScreenProps) => {
	const isHeight = props.dimension === 'height'
	const current = isHeight ? props.currentHeight : props.currentWidth
	const min = isHeight ? props.minHeight : props.minWidth
	const difference = min - current
	const label = isHeight ? 'HEIGHT' : 'WIDTH'
	const unit = isHeight ? 'lines' : 'columns'

	return (
		<Box flexDirection="column" justifyContent="flex-end">
			<Text bold color="yellow">
				CHANGE TERMINAL\WINDOW {label}
			</Text>
			<Text>
				Current {label.toLowerCase()}:{' '}
				<Text color="red" bold>
					{current}
				</Text>
			</Text>
			<Text>
				Minimum required {label.toLowerCase()}:{' '}
				<Text color="green" bold>
					{min}
				</Text>
			</Text>
			<Text>
				You should increase the {label.toLowerCase()} by <Text underline>{difference}</Text> {unit}
			</Text>
		</Box>
	)
}
