import { persistentAtom } from '@nanostores/persistent'
import { availableCountries } from '@nike-release-checker/sdk'
import { computed } from 'nanostores'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { logger } from '../utils/logger.ts'

import type { CountryCode } from '@nike-release-checker/sdk'

const { HOME, COUNTRY } = inputDictionary

export const createCountry = () => {
	const LOG_SCOPE = 'country'
	const $country = persistentAtom<(typeof availableCountries)[number] | null>('country', null, {
		encode: JSON.stringify,
		decode: JSON.parse,
	})

	$router.open($country.get() ? HOME.url : COUNTRY.url)

	return {
		get value(): typeof $country {
			return $country
		},
		set(countryCode: CountryCode) {
			const targetCountry = availableCountries.find(({ code }) => countryCode === code)
			if (!targetCountry) {
				logger.info('country code not found', { scope: LOG_SCOPE, countryCode })
				return
			}

			$country.set(targetCountry)
			$router.open(HOME.url)
		},
		reset: () => {
			logger.info('country reset requested', { scope: LOG_SCOPE })
			$country.set(null)
			$router.open(COUNTRY.url)
		},
		readableValue: computed($country, (countryObj) =>
			countryObj ? countryObj.name : 'Not Selected'
		),
	}
}

export const $country = createCountry()
