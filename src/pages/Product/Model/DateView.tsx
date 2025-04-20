import { Box, Text } from 'ink'

const formatLocaleDate = (dateString: string | undefined, language?: string): string => {
	if (!dateString) return 'N/A'

	try {
		const date = new Date(dateString)
		return date.toLocaleString(language, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3,
			timeZoneName: 'long',
		})
	} catch {
		return dateString
	}
}

export const DateView = ({ date, type }: { date: string | undefined; type: 'start' | 'end' }) => {
	return (
		<Box>
			<Box width={6}>
				<Text>{type === 'start' ? 'Start:' : 'End:'}</Text>
			</Box>
			<Text> {formatLocaleDate(date)}</Text>
		</Box>
	)
}
