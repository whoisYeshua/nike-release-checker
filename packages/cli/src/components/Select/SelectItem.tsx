import { Text } from 'ink'

import { theme } from '../../utils/theme.ts'

export type SelectItemProps = {
	readonly isSelected?: boolean
	readonly label: string
}

export const SelectItem = ({ isSelected = false, label }: SelectItemProps) => {
	return <Text color={isSelected ? theme.color.snkrsRed : undefined}>{label}</Text>
}
