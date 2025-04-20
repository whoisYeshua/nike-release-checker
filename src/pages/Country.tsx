import { availableCountries } from '#snkrs-sdk'
import { Box, Text } from 'ink'

import { Select } from '../components/Select/Select.tsx'
import { $country } from '../store/country.ts'

const countryItems = availableCountries.map(({ code, name, description }) => ({
	label: description ? `${name} (${description})` : name,
	value: code,
}))

export const Country = () => (
	<Box flexDirection="column">
		<Text>Select Country: </Text>
		<Select items={countryItems} limit={27} onSelect={({ value }) => ($country.value = value)} />
	</Box>
)
