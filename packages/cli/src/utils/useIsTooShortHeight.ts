import { theme } from './theme.ts'
import { useScreenSize } from './useScreenSize.ts'

export const useIsTooShortHeight = (): boolean => {
	const { height } = useScreenSize()
	return height < theme.sizes.fullHeight
}
