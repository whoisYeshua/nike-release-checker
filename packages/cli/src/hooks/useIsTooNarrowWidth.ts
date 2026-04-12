import { useWindowSize } from 'ink'

import { theme } from '../utils/theme.ts'

export const useIsTooNarrowWidth = () => {
	const { columns: width } = useWindowSize()
	const minWidth = theme.sizes.fullWidth
	const isTooNarrow = width < minWidth

	return { isTooNarrow, currentWidth: width, minWidth }
}
