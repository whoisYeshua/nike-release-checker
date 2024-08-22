import { useStore } from '@nanostores/react'

import { router } from '../router.js'
import { inputDictionary } from '../utils/inputDictionary.js'
import { Home } from './Home.js'
import { SelectCountry } from './Country.js'

const { HOME, COUNTRY } = inputDictionary

export const Pages = () => {
  const page = useStore(router)

  if (!page) return null
  if (page.route === HOME.routeName) return <Home />
  if (page.route === COUNTRY.routeName) return <SelectCountry />

  return null
}
