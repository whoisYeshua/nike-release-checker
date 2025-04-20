import { useStore } from '@nanostores/react'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { Country } from './Country.tsx'
import { Home } from './Home.tsx'
import { Product } from './Product/Product.tsx'

const { HOME, COUNTRY, PRODUCT } = inputDictionary

export const Pages = () => {
	const page = useStore($router)

	if (!page) return null
	if (page.route === HOME.routeName) return <Home />
	if (page.route === COUNTRY.routeName) return <Country />
	if (page.route === PRODUCT.routeName) return <Product />
	return null
}
