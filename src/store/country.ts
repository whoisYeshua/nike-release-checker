import { persistentAtom } from '@nanostores/persistent'
import { availableCountries } from '#snkrs-sdk'
import { computed } from 'nanostores'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'

import type { CountryCode } from '#snkrs-sdk'

const { HOME, COUNTRY } = inputDictionary

const createCountry = () => {
	const $country = persistentAtom<(typeof availableCountries)[number] | null>('country', null, {
		encode: JSON.stringify,
		decode: JSON.parse,
	})

	$country.subscribe((country) => {
		$router.open(country ? HOME.url : COUNTRY.url)
	})

	return {
		get value(): typeof $country {
			return $country
		},
		set value(countryCode: CountryCode) {
			const targetCountry = availableCountries.find(({ code }) => countryCode === code)
			if (!targetCountry) return

			$country.set(targetCountry)
		},
		reset: () => $country.set(null),
		readableValue: computed($country, (countryObj) =>
			countryObj ? countryObj.name : 'Not Selected'
		),
	}
}

export const $country = createCountry()
