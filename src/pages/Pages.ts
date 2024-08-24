import { createElement } from 'react'
import { useStore } from '@nanostores/react'

import { router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { Home } from './Home.ts'
import { SelectCountry } from './Country.ts'

const { HOME, COUNTRY } = inputDictionary

export const Pages = () => {
	const page = useStore(router)
	if (!page) return null
	if (page.route === HOME.routeName) return createElement(Home)
	if (page.route === COUNTRY.routeName) return createElement(SelectCountry)
	return null
}
