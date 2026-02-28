import { useStore } from '@nanostores/react'

import { ChangeSizeScreen } from '../components/ChangeSizeScreen.tsx'
import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { useIsTooNarrowWidth } from '../utils/useIsTooNarrowWidth.ts'
import { useIsTooShortHeight } from '../utils/useIsTooShortHeight.ts'
import { Country } from './Country.tsx'
import { Home } from './Home.tsx'
import { Product } from './Product/Product.tsx'

const { HOME, COUNTRY, PRODUCT } = inputDictionary

export const Pages = () => {
	const page = useStore($router)
	const { isTooShort, currentHeight, minHeight } = useIsTooShortHeight()
	const { isTooNarrow, currentWidth, minWidth } = useIsTooNarrowWidth()

	if (isTooShort)
		return (
			<ChangeSizeScreen dimension="height" currentHeight={currentHeight} minHeight={minHeight} />
		)
	if (isTooNarrow)
		return <ChangeSizeScreen dimension="width" currentWidth={currentWidth} minWidth={minWidth} />
	if (!page) return null
	if (page.route === HOME.routeName) return <Home />
	if (page.route === COUNTRY.routeName) return <Country />
	if (page.route === PRODUCT.routeName) return <Product />
	return null
}
