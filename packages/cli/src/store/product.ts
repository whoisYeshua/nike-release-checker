import { formatProductFeedResponse, getProductFeed } from '@nike-release-checker/sdk'
import { atom, computed, map, onMount, task } from 'nanostores'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { logger } from '../utils/logger.ts'
import { $country } from './country.ts'

type FormatProductFeedResponse = ReturnType<typeof formatProductFeedResponse>

interface ProductState {
	loading: boolean
	error: string | null
	data: FormatProductFeedResponse | null
}

export const createProducts = () => {
	const LOG_SCOPE = 'products'
	const initialState: ProductState = {
		loading: true,
		error: null,
		data: [],
	}

	const $store = map<ProductState>(initialState)
	let lastLoadedCountryKey: string | null = null

	onMount($store, () =>
		$country.value.subscribe((country) => {
			if (!country) {
				logger.debug('country not selected, skip product load', { scope: LOG_SCOPE })
				return
			}

			const { code: countryCode, language } = country
			const countryKey = `${countryCode}:${language}`
			const state = $store.get()

			if (countryKey === lastLoadedCountryKey && state.data?.length && !state.error) {
				logger.debug('skip reload for same country with cached data', {
					scope: LOG_SCOPE,
					countryKey,
					itemCount: state.data.length,
				})
				return
			}

			lastLoadedCountryKey = countryKey
			$store.set(initialState)
			logger.debug('product load started', { scope: LOG_SCOPE, countryKey })

			task(async () => {
				try {
					const data = formatProductFeedResponse(await getProductFeed({ countryCode, language }))
					$store.setKey('data', data)
					logger.info('product load succeeded', {
						scope: LOG_SCOPE,
						countryKey,
						itemCount: data.length,
					})
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'Some error ocured'
					$store.setKey('error', errorMsg)
					logger.error('product load failed', {
						scope: LOG_SCOPE,
						countryKey,
						error: errorMsg,
					})
				} finally {
					$store.setKey('loading', false)
					logger.debug('product load finished', { scope: LOG_SCOPE, countryKey })
				}
			})
		})
	)

	return {
		get value() {
			return $store
		},
	}
}

export const createSelectedProductSlug = () => {
	const LOG_SCOPE = 'selected-product-slug'
	const $store = atom<string | null>(null)
	const $lastSelected = atom<string | null>(null)

	const reset = () => {
		logger.info('product slug cleared', { scope: LOG_SCOPE })
		$store.set(null)
	}

	$router.listen((routerState) => {
		if (routerState?.route !== inputDictionary.PRODUCT.routeName) {
			reset()
		}
	})

	return {
		get value(): typeof $store {
			return $store
		},
		set(slug: string | null) {
			logger.info('product slug set', { scope: LOG_SCOPE, slug })
			$store.set(slug)
			if (slug) {
				$lastSelected.set(slug)
				$router.open(inputDictionary.PRODUCT.routeName)
			}
		},
		get lastSelected(): typeof $lastSelected {
			return $lastSelected
		},
		reset,
	}
}
export const $products = createProducts()
export const $selectedProductSlug = createSelectedProductSlug()
export const $selectedProduct = computed($selectedProductSlug.value, (selectedProductSlug) => {
	const product =
		$products.value.get().data?.find(({ slug }) => slug === selectedProductSlug) ?? null

	logger.debug('selected product resolved', {
		scope: 'selected-product',
		slug: selectedProductSlug,
	})

	return product
})

export const createSelectedModel = () => {
	const LOG_SCOPE = 'selected-model'
	const $selectedModelIdAtom = atom<string | null>(null)

	const reset = () => {
		logger.info('selected model cleared', { scope: LOG_SCOPE })
		$selectedModelIdAtom.set(null)
	}

	$selectedProductSlug.value.listen(() => {
		logger.debug('selected product changed, resetting model', { scope: LOG_SCOPE })
		reset()
	})

	return {
		value: computed(
			[$selectedProduct, $selectedModelIdAtom],
			(selectedProduct, selectedModelId) => {
				if (!selectedProduct) {
					logger.debug('no selected product', { scope: LOG_SCOPE })
					return null
				}

				if (!selectedModelId) {
					const fallbackModel = selectedProduct.models[0] ?? null
					logger.debug('no model selected, trying to use first available model', {
						scope: LOG_SCOPE,
						slug: selectedProduct.slug,
						modelId: fallbackModel?.id,
					})
					return fallbackModel
				}

				const foundModel =
					selectedProduct.models.find((model) => model.id === selectedModelId) ?? null
				logger.debug('selected model resolved to ' + (foundModel?.modelName ?? foundModel?.id), {
					scope: LOG_SCOPE,
					slug: selectedProduct.slug,
					modelId: foundModel?.id,
				})

				return foundModel
			}
		),
		setId: (modelId: string) => {
			logger.info('model selected', { scope: LOG_SCOPE, modelId })
			$selectedModelIdAtom.set(modelId)
		},
	}
}
export const $selectedModel = createSelectedModel()
