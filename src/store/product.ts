import { formatProductFeedResponse, getProductFeed } from '#snkrs-sdk'
import { atom, computed, map, onMount, task } from 'nanostores'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'
import { $country } from './country.ts'

type FormatProductFeedResponse = ReturnType<typeof formatProductFeedResponse>

interface ProductState {
	loading: boolean
	error: string | null
	data: FormatProductFeedResponse | null
}

const createProducts = () => {
	const initialState: ProductState = {
		loading: true,
		error: null,
		data: [],
	}

	const $store = map<ProductState>(initialState)
	let lastLoadedCountryKey: string | null = null

	onMount($store, () =>
		$country.value.subscribe((country) => {
			if (!country) return

			const { code: countryCode, language } = country
			const countryKey = `${countryCode}:${language}`
			const state = $store.get()

			if (countryKey === lastLoadedCountryKey && state.data?.length && !state.error) return

			lastLoadedCountryKey = countryKey
			$store.set(initialState)

			task(async () => {
				try {
					const data = formatProductFeedResponse(await getProductFeed({ countryCode, language }))
					$store.setKey('data', data)
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'Some error ocured'
					$store.setKey('error', errorMsg)
				} finally {
					$store.setKey('loading', false)
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
	const $store = atom<string | null>(null)

	const reset = () => $store.set(null)

	$store.listen((selectedProduct) => {
		if (selectedProduct) $router.open(inputDictionary.PRODUCT.routeName)
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
			$store.set(slug)
		},
		reset,
	}
}

export const $products = createProducts()
export const $selectedProductSlug = createSelectedProductSlug()
export const $selectedProduct = computed($selectedProductSlug.value, (selectedProductSlug) =>
	$products.value.get().data?.find(({ slug }) => slug === selectedProductSlug)
)

const createSelectedModel = () => {
	const $selectedModelIdAtom = atom<string | null>(null)

	const reset = () => $selectedModelIdAtom.set(null)

	$selectedProductSlug.value.listen(() => {
		reset()
	})

	return {
		value: computed(
			[$selectedProduct, $selectedModelIdAtom],
			(selectedProduct, selectedModelId) => {
				if (!selectedProduct) return null
				if (!selectedModelId) return selectedProduct.models[0] ?? null
				return selectedProduct.models.find((model) => model.id === selectedModelId) ?? null
			}
		),
		setId: $selectedModelIdAtom.set,
	}
}
export const $selectedModel = createSelectedModel()

const createProductImageStore = () => {
	const store = map<Record<string, { data?: ArrayBuffer | null; loading: boolean }>>()

	onMount(store, () => {
		$selectedProduct.subscribe((selectedProduct) => {
			const slug = selectedProduct?.slug
			if (!slug || store.get()[slug]) return
			task(async () => {
				try {
					store.setKey(slug, { loading: true, data: null })
					const response = await fetch(selectedProduct.imageUrl)
					if (!response.ok) return
					const arrayBuffer = await response.arrayBuffer()
					store.setKey(slug, { data: arrayBuffer, loading: false })
				} catch {
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
		if (!selectedProduct) return
		return productImageStore[selectedProduct.slug]
	}
)
