import { formatProductFeedResponse, getProductFeed } from '#snkrs-sdk'
import { atom, computed, map, onMount, task } from 'nanostores'
import prettyBytes from 'pretty-bytes'

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

const createProducts = () => {
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

const createSelectedProductSlug = () => {
	const LOG_SCOPE = 'selected-product-slug'
	const $store = atom<string | null>(null)

	const reset = () => {
		logger.info('product slug cleared', { scope: LOG_SCOPE })
		$store.set(null)
	}

	$store.listen((selectedProduct) => {
		if (selectedProduct) {
			$router.open(inputDictionary.PRODUCT.routeName)
		}
	})

	$router.listen((routerState) => {
		if (routerState?.route !== inputDictionary.PRODUCT.routeName) {
			reset()
		}
	})

	return {
		get value(): typeof $store {
			return $store
		},
		set value(slug: string | null) {
			logger.info('product slug set', { scope: LOG_SCOPE, slug })
			$store.set(slug)
		},
		reset,
	}
}

export const $products = createProducts()
export const $selectedProductSlug = createSelectedProductSlug()
export const $selectedProduct = computed($selectedProductSlug.value, (selectedProductSlug) => {
	const product =
		$products.value.get().data?.find(({ slug }) => slug === selectedProductSlug) ?? null

	logger.debug('selected product resolved', { scope: 'selected-product', slug: selectedProductSlug })

	return product
})

const createSelectedModel = () => {
	const LOG_SCOPE = 'selected-model'
	const $selectedModelIdAtom = atom<string | null>(null)

	const reset = () => {
		logger.info('model cleared', { scope: LOG_SCOPE })
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
				logger.debug(
					'selected model resolved to ' + (foundModel?.modelName ?? foundModel?.id),
					{ scope: LOG_SCOPE, slug: selectedProduct.slug, modelId: foundModel?.id }
				)

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

const createProductImageStore = () => {
	const LOG_SCOPE = 'product-image'
	const store = map<Record<string, { data?: ArrayBuffer | null; loading: boolean }>>()
	const getTotalStoreBufferSize = () =>
		Object.values(store.get()).reduce((acc, { data }) => acc + (data?.byteLength ?? 0), 0)

	const uniqId = crypto.randomUUID()
	logger.debug('product image store created', { scope: LOG_SCOPE, uniqId })
	onMount(store, () => {
		logger.debug('product image store mounted', { scope: LOG_SCOPE, uniqId })
		return $selectedProduct.subscribe((selectedProduct) => {
			const slug = selectedProduct?.slug
			if (!slug) {
				logger.debug('skip image fetch, no product selected', { scope: LOG_SCOPE })
				return
			}
			if (store.get()[slug]) {
				logger.debug('image already cached, skipping fetch', { scope: LOG_SCOPE, uniqId, slug })
				return
			}
			task(async () => {
				try {
					logger.debug('product image fetch started', { scope: LOG_SCOPE, slug })
					store.setKey(slug, { loading: true, data: null })
					const response = await fetch(selectedProduct.imageUrl)
					if (!response.ok) return
					const arrayBuffer = await response.arrayBuffer()
					store.setKey(slug, { data: arrayBuffer, loading: false })
					logger.debug(
						'product image fetch succeeded',
						{
							scope: LOG_SCOPE,
							slug,
							imageSize: prettyBytes(arrayBuffer.byteLength),
							totalSize: prettyBytes(getTotalStoreBufferSize()),
						}
					)
					logger.info('product image fetch succeeded', { scope: LOG_SCOPE, slug })
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'unknown error'
					logger.error('product image fetch errored', {
						scope: LOG_SCOPE,
						slug,
						error: errorMsg,
					})
					store.setKey(slug, { data: null, loading: false })
				}
			})
		})
	})

	return store
}
const $productImageStore = createProductImageStore()
export const $selectedProductImage = computed(
	[$selectedProduct, $productImageStore],
	(selectedProduct, productImageStore) => {
		const LOG_SCOPE = 'selected-product-image'
		if (!selectedProduct) {
			logger.debug('no product selected, image unavailable', { scope: LOG_SCOPE })
			return
		}
		return productImageStore[selectedProduct.slug]
	}
)
