import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

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

	logger.debug('selected product resolved', { scope: 'selected-product', selectedProductSlug })

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

interface CachedImage {
	path: string | null
	loading: boolean
}

const imageCacheDir = path.join(tmpdir(), 'nike-release-checker', 'images')

export const createProductImageCache = () => {
	const LOG_SCOPE = 'product-image-cache'
	const store = map<Record<string, CachedImage>>()

	onMount(store, () => {
		logger.debug('image cache mounted', { scope: LOG_SCOPE, imageCacheDir })
		const unsubscribeProduct = $selectedProduct.listen((selectedProduct) => {
			logger.debug('selected product changed, clearing image cache', {
				scope: LOG_SCOPE,
				slug: selectedProduct?.slug ?? null,
			})
			store.set({})
		})

		const unsubscribeModel = $selectedModel.value.subscribe((selectedModel) => {
			if (!selectedModel?.imageUrl) return
			const modelId = selectedModel.id
			const imageUrl = selectedModel.imageUrl
			if (store.get()[modelId]) return

			const requestedSlug = $selectedProductSlug.value.get()

			task(async () => {
				try {
					store.setKey(modelId, { loading: true, path: null })
					logger.debug('image fetch started', { scope: LOG_SCOPE, modelId, imageUrl })
					const response = await fetch(imageUrl)
					if (!response.ok) {
						logger.warn('image fetch responded with error', {
							scope: LOG_SCOPE,
							modelId,
							status: response.status,
						})
						if ($selectedProductSlug.value.get() === requestedSlug) {
							store.setKey(modelId, { loading: false, path: null })
						}
						return
					}
					const buffer = Buffer.from(await response.arrayBuffer())
					if ($selectedProductSlug.value.get() !== requestedSlug) {
						logger.debug('image fetch stale, product changed', { scope: LOG_SCOPE, modelId })
						return
					}
					await mkdir(imageCacheDir, { recursive: true })
					const filePath = path.join(imageCacheDir, `${modelId}.bin`)
					await writeFile(filePath, buffer)
					if ($selectedProductSlug.value.get() !== requestedSlug) {
						logger.debug('image write stale, product changed', { scope: LOG_SCOPE, modelId })
						return
					}
					store.setKey(modelId, { loading: false, path: filePath })
					logger.info('image cached', { scope: LOG_SCOPE, modelId, size: buffer.byteLength })
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'unknown error'
					logger.error('image fetch failed', { scope: LOG_SCOPE, modelId, error: errorMsg })
					if ($selectedProductSlug.value.get() === requestedSlug) {
						store.setKey(modelId, { loading: false, path: null })
					}
				}
			})
		})

		return () => {
			unsubscribeProduct()
			unsubscribeModel()
			rm(imageCacheDir, { recursive: true, force: true }).catch(() => {})
		}
	})

	return store
}
export const $productImageCache = createProductImageCache()

export const $selectedModelImage = computed(
	[$selectedModel.value, $productImageCache],
	(selectedModel, cache) => {
		if (!selectedModel?.id) return null
		return cache[selectedModel.id] ?? null
	}
)
