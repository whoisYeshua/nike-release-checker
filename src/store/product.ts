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
				logger.debug({ scope: LOG_SCOPE }, 'country not selected, skip product load')
				return
			}

			const { code: countryCode, language } = country
			const countryKey = `${countryCode}:${language}`
			const state = $store.get()

			if (countryKey === lastLoadedCountryKey && state.data?.length && !state.error) {
				logger.debug(
					{ scope: LOG_SCOPE, countryKey, itemCount: state.data.length },
					'skip reload for same country with cached data'
				)
				return
			}

			lastLoadedCountryKey = countryKey
			$store.set(initialState)
			logger.debug({ scope: LOG_SCOPE, countryKey }, 'product load started')

			task(async () => {
				try {
					const data = formatProductFeedResponse(await getProductFeed({ countryCode, language }))
					$store.setKey('data', data)
					logger.info(
						{ scope: LOG_SCOPE, countryKey, itemCount: data.length },
						'product load succeeded'
					)
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'Some error ocured'
					$store.setKey('error', errorMsg)
					logger.error({ scope: LOG_SCOPE, countryKey, error: errorMsg }, 'product load failed')
				} finally {
					$store.setKey('loading', false)
					logger.debug({ scope: LOG_SCOPE, countryKey }, 'product load finished')
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
		logger.info({ scope: LOG_SCOPE }, 'product slug cleared')
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
			logger.info({ scope: LOG_SCOPE, slug }, 'product slug set')
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

	logger.debug(
		{ scope: 'selected-product', slug: selectedProductSlug },
		'selected product resolved'
	)

	return product
})

const createSelectedModel = () => {
	const LOG_SCOPE = 'selected-model'
	const $selectedModelIdAtom = atom<string | null>(null)

	const reset = () => {
		logger.info({ scope: LOG_SCOPE }, 'model cleared')
		$selectedModelIdAtom.set(null)
	}

	$selectedProductSlug.value.listen(() => {
		logger.debug({ scope: LOG_SCOPE }, 'selected product changed, resetting model')
		reset()
	})

	return {
		value: computed(
			[$selectedProduct, $selectedModelIdAtom],
			(selectedProduct, selectedModelId) => {
				if (!selectedProduct) {
					logger.debug({ scope: LOG_SCOPE }, 'no selected product')
					return null
				}

				if (!selectedModelId) {
					const fallbackModel = selectedProduct.models[0] ?? null
					logger.debug(
						{ scope: LOG_SCOPE, slug: selectedProduct.slug, modelId: fallbackModel?.id },
						'no model selected, trying to use first available model'
					)
					return fallbackModel
				}

				const foundModel =
					selectedProduct.models.find((model) => model.id === selectedModelId) ?? null
				logger.debug(
					{ scope: LOG_SCOPE, slug: selectedProduct.slug, modelId: foundModel?.id },
					'selected model resolved to ' + (foundModel?.modelName ?? foundModel?.id)
				)

				return foundModel
			}
		),
		setId: (modelId: string) => {
			logger.info({ scope: LOG_SCOPE, modelId }, 'model selected')
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
	logger.debug({ scope: LOG_SCOPE, uniqId }, 'product image store created')
	onMount(store, () => {
		logger.debug({ scope: LOG_SCOPE, uniqId }, 'product image store mounted')
		return $selectedProduct.subscribe((selectedProduct) => {
			const slug = selectedProduct?.slug
			if (!slug) {
				logger.debug({ scope: LOG_SCOPE }, 'skip image fetch, no product selected')
				return
			}
			if (store.get()[slug]) {
				logger.debug({ scope: LOG_SCOPE, uniqId, slug }, 'image already cached, skipping fetch')
				return
			}
			task(async () => {
				try {
					logger.debug({ scope: LOG_SCOPE, slug }, 'product image fetch started')
					store.setKey(slug, { loading: true, data: null })
					const response = await fetch(selectedProduct.imageUrl)
					if (!response.ok) return
					const arrayBuffer = await response.arrayBuffer()
					store.setKey(slug, { data: arrayBuffer, loading: false })
					logger.debug(
						{
							scope: LOG_SCOPE,
							slug,
							imageSize: prettyBytes(arrayBuffer.byteLength),
							totalSize: prettyBytes(getTotalStoreBufferSize()),
						},
						'product image fetch succeeded'
					)
					logger.info({ scope: LOG_SCOPE, slug }, 'product image fetch succeeded')
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'unknown error'
					logger.error({ scope: LOG_SCOPE, slug, error: errorMsg }, 'product image fetch errored')
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
			logger.debug({ scope: LOG_SCOPE }, 'no product selected, image unavailable')
			return
		}
		return productImageStore[selectedProduct.slug]
	}
)
