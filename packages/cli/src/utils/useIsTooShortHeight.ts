import { theme } from './theme.ts'
import { useScreenSize } from './useScreenSize.ts'

export const useIsTooShortHeight = () => {
	const { height } = useScreenSize()
	const minHeight = theme.sizes.fullHeight
	const isTooShort = height < minHeight

	return { isTooShort, currentHeight: height, minHeight }
}
