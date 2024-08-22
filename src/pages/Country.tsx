import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'

import { setCountry } from '../store/countryStore.js'
import { countries } from '../utils/countries.js'

import type { Entries } from '../types/utils/Entries.js'

const sortedCountries = (Object.entries(countries) as Entries<typeof countries>).sort((a, b) =>
  a[1].country.localeCompare(b[1].country)
)

const countryItems = sortedCountries.map(([key, countryObject]) => ({
  label: countryObject.country,
  value: key,
}))

export const SelectCountry = () => (
  <Box flexDirection="column">
    <Text>Select Country: </Text>
    <SelectInput items={countryItems} limit={20} onSelect={({ value }) => setCountry(value)} />
  </Box>
)
