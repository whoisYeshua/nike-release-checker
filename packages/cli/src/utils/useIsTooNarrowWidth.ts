import { theme } from './theme.ts'
import { useScreenSize } from './useScreenSize.ts'

export const useIsTooNarrowWidth = () => {
	const { width } = useScreenSize()
	const minWidth = theme.sizes.fullWidth
	const isTooNarrow = width < minWidth

	return { isTooNarrow, currentWidth: width, minWidth }
}
