import SelectInput from 'ink-select-input'

import { SelectIndicator } from './SelectIndicator.tsx'
import { SelectItem } from './SelectItem.tsx'

import type { ComponentProps } from 'react'

export const Select = <V,>({
	itemComponent = SelectItem,
	indicatorComponent = SelectIndicator,
	...rest
}: ComponentProps<typeof SelectInput<V>>) => {
	return (
		<SelectInput itemComponent={itemComponent} indicatorComponent={indicatorComponent} {...rest} />
	)
}
