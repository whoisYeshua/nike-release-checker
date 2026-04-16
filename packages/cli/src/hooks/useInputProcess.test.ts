import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'

import { availableCountries } from '@nike-release-checker/sdk'

import { $router } from '../router.ts'
import { $country } from '../store/country.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { handleKeyboardInput } from './useInputProcess.ts'

import type { Key } from 'ink'

const { HOME, COUNTRY } = inputDictionary

const neutralKey = {} as Key

describe('useInputProcess', () => {
	let routerOpenMock: ReturnType<typeof mock.method<typeof $router.open>>
	let countryResetMock: ReturnType<typeof mock.method<typeof $country.reset>>

	beforeEach(() => {
		localStorage.clear()
		routerOpenMock = mock.method($router, 'open')
		countryResetMock = mock.method($country, 'reset')
	})

	afterEach(() => {
		routerOpenMock.mock.restore()
		countryResetMock.mock.restore()
	})

	test('HOME key opens home route', () => {
		handleKeyboardInput(HOME.key, neutralKey)
		assert.strictEqual(routerOpenMock.mock.calls.length, 1)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [HOME.url])
		assert.strictEqual(countryResetMock.mock.calls.length, 0)
	})

	test('COUNTRY key resets country store', () => {
		$country.set(availableCountries[0].code)
		routerOpenMock.mock.resetCalls()
		countryResetMock.mock.resetCalls()
		handleKeyboardInput(COUNTRY.key, neutralKey)
		assert.strictEqual(countryResetMock.mock.calls.length, 1)
		assert.strictEqual(routerOpenMock.mock.calls.length, 1)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0]?.arguments, [COUNTRY.url])
	})

	test('other keys do not navigate or reset', () => {
		handleKeyboardInput('U', neutralKey)
		handleKeyboardInput('S', neutralKey)
		handleKeyboardInput('', { downArrow: true } as Key)
		assert.strictEqual(routerOpenMock.mock.calls.length, 0)
		assert.strictEqual(countryResetMock.mock.calls.length, 0)
	})
})
