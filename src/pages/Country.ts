import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'

import { setCountry } from '../store/countryStore.ts'
import { countries, type CountryCode } from '../utils/countries.ts'

import { createElement } from 'react'

const countryItems = countries.map(({ code, name }) => ({
	label: name,
	value: code,
}))

export const SelectCountry = () =>
	createElement(
		Box,
		{ flexDirection: 'column' },
		createElement(Text, null, 'Select Country: '),
		createElement(SelectInput<CountryCode>, {
			items: countryItems,
			limit: 20,
			onSelect: ({ value }) => setCountry(value),
		})
	)
