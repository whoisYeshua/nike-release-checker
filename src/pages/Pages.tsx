import { useStore } from '@nanostores/react'

import { router } from '../router'
import { inputDictionary } from '../utils/inputDictionary'
import { Home } from './Home'
import { SelectCountry } from './Country'

const { HOME, COUNTRY } = inputDictionary

export const Pages = () => {
  const page = useStore(router)

  if (!page) return null
  if (page.route === HOME.routeName) return <Home />
  if (page.route === COUNTRY.routeName) return <SelectCountry />

  return null
}
