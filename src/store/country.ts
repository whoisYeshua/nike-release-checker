import { persistentAtom } from '@nanostores/persistent'
import { availableCountries } from '#snkrs-sdk'
import { computed } from 'nanostores'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { logger } from '../utils/logger.ts'

import type { CountryCode } from '#snkrs-sdk'

const { HOME, COUNTRY } = inputDictionary

export const createCountry = () => {
	const LOG_SCOPE = 'country'
	const $country = persistentAtom<(typeof availableCountries)[number] | null>('country', null, {
		encode: JSON.stringify,
		decode: JSON.parse,
	})

	$country.subscribe((country) => {
		logger.info({ scope: LOG_SCOPE, country }, 'country selected')
		$router.open(country ? HOME.url : COUNTRY.url)
	})

	return {
		get value(): typeof $country {
			return $country
		},
		set value(countryCode: CountryCode) {
			const targetCountry = availableCountries.find(({ code }) => countryCode === code)
			if (!targetCountry) {
				logger.info({ scope: LOG_SCOPE, countryCode }, 'country code not found')
				return
			}

			$country.set(targetCountry)
		},
		reset: () => {
			logger.info({ scope: LOG_SCOPE }, 'country reset requested')
			$country.set(null)
		},
		readableValue: computed($country, (countryObj) =>
			countryObj ? countryObj.name : 'Not Selected'
		),
	}
}

export const $country = createCountry()
