import { useWindowSize } from 'ink'

import { theme } from '../utils/theme.ts'

export const useIsTooShortHeight = () => {
	const { rows: height } = useWindowSize()
	const minHeight = theme.sizes.fullHeight
	const isTooShort = height < minHeight

	return { isTooShort, currentHeight: height, minHeight }
}
