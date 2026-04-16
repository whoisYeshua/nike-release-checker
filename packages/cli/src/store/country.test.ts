import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'

import { availableCountries } from '@nike-release-checker/sdk'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { createCountry } from './country.ts'

const { HOME, COUNTRY } = inputDictionary

describe('$country store', () => {
	let routerOpenMock = mock.method($router, 'open')

	beforeEach(() => {
		localStorage.clear()
	})

	test('should initialize with null value', () => {
		const $country = createCountry()

		assert.strictEqual($country.value.get(), null)
		assert.strictEqual($country.readableValue.get(), 'Not Selected')
		assert.strictEqual(routerOpenMock.mock.calls.length, 1)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [COUNTRY.url])
	})

	test('should set valid country and trigger router navigation', () => {
		const $country = createCountry()
		routerOpenMock.mock.resetCalls()
		const targetCountry = availableCountries[0]
		$country.set(targetCountry.code)

		assert.deepStrictEqual($country.value.get(), targetCountry)
		assert.strictEqual($country.readableValue.get(), targetCountry.name)
		assert.strictEqual(routerOpenMock.mock.calls.length, 1)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [HOME.url])
	})

	test('should not set invalid country code', () => {
		const $country = createCountry()
		const initialState = $country.value.get()
		$country.set('INVALID' as any)

		assert.deepStrictEqual($country.value.get(), initialState)
	})

	test('should persist country selection', () => {
		const $country = createCountry()
		const targetCountry = availableCountries[0]
		$country.set(targetCountry.code)

		// Read directly from localStorage to verify persistence
		const stored = JSON.parse(localStorage.getItem('country') || 'null')
		assert.deepStrictEqual(stored, targetCountry)
	})

	test('should treat missing country key in localStorage as null when parsing', () => {
		const stored = JSON.parse(localStorage.getItem('country') || 'null')
		assert.strictEqual(stored, null)
	})

	test('should load persisted country on initialization', () => {
		const targetCountry = availableCountries[0]
		localStorage.setItem('country', JSON.stringify(targetCountry))

		// Create new store instance that should load from localStorage
		routerOpenMock.mock.resetCalls()
		const $country = createCountry()

		assert.deepStrictEqual($country.value.get(), targetCountry)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [HOME.url])
	})

	test('should reset country and trigger router navigation', () => {
		const $country = createCountry()
		// First set a country
		const targetCountry = availableCountries[0]
		$country.set(targetCountry.code)

		// Clear mock calls from setting the country
		routerOpenMock.mock.resetCalls()

		// Then reset it
		$country.reset()

		assert.strictEqual($country.value.get(), null)
		assert.strictEqual($country.readableValue.get(), 'Not Selected')
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [COUNTRY.url])
	})

	test('should update readableValue when country changes', () => {
		const $country = createCountry()
		const targetCountry = availableCountries[0]
		$country.set(targetCountry.code)

		assert.strictEqual($country.readableValue.get(), targetCountry.name)
	})
})
