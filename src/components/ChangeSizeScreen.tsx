import { Box, Text } from 'ink'

import { theme } from '../utils/theme.ts'
import { useScreenSize } from '../utils/useScreenSize.ts'

export const ChangeSizeScreen = () => {
	const { height } = useScreenSize()

	const HEADER_AND_FOOTER_ROWS = 6

	return (
		<Box flexDirection="column" height={theme.sizes.fullHeight - HEADER_AND_FOOTER_ROWS} justifyContent="flex-end">
			<Text bold color="yellow">CHANGE TERMINAL\WINDOW HEIGHT</Text>
			<Text>Current height: <Text color="red" bold>{height}</Text></Text>
			<Text>Minimum required height: <Text color="green" bold>{theme.sizes.fullHeight}</Text></Text>
			<Text>You should increase the height by <Text underline>{theme.sizes.fullHeight - height}</Text> lines</Text>
		</Box>
	)
}
