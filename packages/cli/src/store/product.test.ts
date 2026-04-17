import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'

import { allTasks, atom, cleanStores, keepMount } from 'nanostores'

import { $router } from '../router.ts'
import { inputDictionary } from '../utils/inputDictionary.ts'

const { HOME, PRODUCT } = inputDictionary

const mockCountry = {
	code: 'US',
	name: 'United States',
	language: 'en',
	description: '',
	emoji: '🇺🇸',
}
const mockCountry2 = { code: 'FR', name: 'France', language: 'fr', description: '', emoji: '🇫🇷' }

const mockModels = {
	airMax90Mens: {
		id: 'air-max-90-mens',
		modelName: 'Men',
		imageUrl: 'https://example.test/air-max-90-mens.jpg',
		launchView: { startEntryDate: '2026-04-01T09:00:00.000Z' },
		sizes: [],
	},
	airMax90Gs: {
		id: 'air-max-90-gs',
		modelName: 'GS',
		imageUrl: 'https://example.test/air-max-90-gs.jpg',
		launchView: { startEntryDate: '2026-04-01T09:00:00.000Z' },
		sizes: [],
	},
	pegasus41: {
		id: 'pegasus-41-standard',
		modelName: 'Standard',
		imageUrl: 'https://example.test/pegasus-41-standard.jpg',
		launchView: { startEntryDate: '2026-04-02T09:00:00.000Z' },
		sizes: [],
	},
}
const mockProducts = [
	{
		slug: 'air-max-90',
		title: 'Air Max 90',
		models: [mockModels.airMax90Mens, mockModels.airMax90Gs],
	},
	{
		slug: 'pegasus-41',
		title: 'Pegasus 41',
		models: [mockModels.pegasus41],
	},
	{
		slug: 'calm-slide',
		title: 'Calm Slide',
		models: [],
	},
]

const emptyProductsState = () => ({
	loading: false,
	error: null,
	data: [],
})

const loadedMockProductsState = { loading: false, error: null, data: mockProducts as any }

const mockGetProductFeed = mock.fn(
	async (_params: { countryCode: string; language: string }) => [] as never[]
)
const mockFormatProductFeedResponse = mock.fn(() => mockProducts)

mock.module('@nike-release-checker/sdk', {
	namedExports: {
		getProductFeed: mockGetProductFeed,
		formatProductFeedResponse: mockFormatProductFeedResponse,
	},
})

const $mockCountryAtom = atom<typeof mockCountry | null>(null)

mock.module('./country.ts', {
	namedExports: {
		$country: { value: $mockCountryAtom },
	},
})

const {
	createProducts,
	createSelectedProductSlug,
	createSelectedModel,
	$products,
	$selectedProductSlug,
	$selectedProduct,
} = await import('./product.ts')

describe('$products store - createProducts', () => {
	beforeEach(() => {
		$mockCountryAtom.set(null)
		mockGetProductFeed.mock.resetCalls()
		mockGetProductFeed.mock.mockImplementation(async () => [])
		mockFormatProductFeedResponse.mock.resetCalls()
		mockFormatProductFeedResponse.mock.mockImplementation(() => mockProducts)
	})

	test('initial state is loading with empty data', () => {
		const products = createProducts()

		assert.deepStrictEqual(products.value.get(), {
			loading: true,
			error: null,
			data: [],
		})

		cleanStores(products.value)
	})

	test('loads products when country is emitted', async () => {
		const products = createProducts()
		keepMount(products.value)

		$mockCountryAtom.set(mockCountry)
		await allTasks()

		assert.deepStrictEqual(products.value.get(), {
			loading: false,
			error: null,
			data: mockProducts,
		})
		assert.strictEqual(mockGetProductFeed.mock.callCount(), 1)
		assert.deepStrictEqual(mockGetProductFeed.mock.calls[0].arguments[0], {
			countryCode: mockCountry.code,
			language: mockCountry.language,
		})

		cleanStores(products.value)
	})

	test('sets error state when fetch fails', async () => {
		mockGetProductFeed.mock.mockImplementation(async () => {
			throw new Error('Network fail')
		})

		const products = createProducts()
		keepMount(products.value)

		$mockCountryAtom.set(mockCountry)
		await allTasks()

		assert.deepStrictEqual(products.value.get(), {
			loading: false,
			error: 'Network fail',
			data: [],
		})

		cleanStores(products.value)
	})

	test('skips reload for same country after successful load', async () => {
		const products = createProducts()
		keepMount(products.value)

		$mockCountryAtom.set(mockCountry)
		await allTasks()

		mockGetProductFeed.mock.resetCalls()

		// Re-emit same country: set null first to force notification on re-set
		$mockCountryAtom.set(null)
		$mockCountryAtom.set(mockCountry)
		await allTasks()

		assert.strictEqual(mockGetProductFeed.mock.callCount(), 0)
		assert.deepStrictEqual(products.value.get(), {
			loading: false,
			error: null,
			data: mockProducts,
		})

		cleanStores(products.value)
	})

	test('retries fetch for same country after error', async () => {
		mockGetProductFeed.mock.mockImplementation(async () => {
			throw new Error('Network fail')
		})

		const products = createProducts()
		keepMount(products.value)

		$mockCountryAtom.set(mockCountry)
		await allTasks()

		mockGetProductFeed.mock.resetCalls()
		mockGetProductFeed.mock.mockImplementation(async () => [])

		$mockCountryAtom.set(null)
		$mockCountryAtom.set(mockCountry)
		await allTasks()

		assert.strictEqual(mockGetProductFeed.mock.callCount(), 1)
		assert.deepStrictEqual(products.value.get(), {
			loading: false,
			error: null,
			data: mockProducts,
		})

		cleanStores(products.value)
	})

	test('loads new data when country changes', async () => {
		const products = createProducts()
		keepMount(products.value)

		$mockCountryAtom.set(mockCountry)
		await allTasks()

		$mockCountryAtom.set(mockCountry2)
		await allTasks()

		assert.strictEqual(mockGetProductFeed.mock.callCount(), 2)
		assert.deepStrictEqual(mockGetProductFeed.mock.calls[1].arguments[0], {
			countryCode: mockCountry2.code,
			language: mockCountry2.language,
		})

		cleanStores(products.value)
	})
})

describe('$selectedProductSlug store - createSelectedProductSlug', () => {
	let routerOpenMock: ReturnType<typeof mock.method<typeof $router.open>>

	beforeEach(() => {
		$selectedProductSlug.value.set(null)
		$selectedProductSlug.lastSelected.set(null)
		routerOpenMock?.mock.restore()
		routerOpenMock = mock.method($router, 'open')
		$router.open(HOME.url)
		routerOpenMock.mock.resetCalls()
	})

	test('initial state is null and lastSelected is null', () => {
		const selectedProductSlug = createSelectedProductSlug()

		assert.strictEqual(selectedProductSlug.value.get(), null)
		assert.strictEqual(selectedProductSlug.lastSelected.get(), null)
	})

	test('setting slug - updates current value, stores lastSelected and opens product route', () => {
		const selectedProductSlug = createSelectedProductSlug()

		selectedProductSlug.set(mockProducts[0].slug)

		assert.strictEqual(selectedProductSlug.value.get(), mockProducts[0].slug)
		assert.strictEqual(selectedProductSlug.lastSelected.get(), mockProducts[0].slug)
		assert.strictEqual(routerOpenMock.mock.callCount(), 1)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [PRODUCT.routeName])
	})

	test('setting null - clears current value without changing lastSelected or navigating', () => {
		const selectedProductSlug = createSelectedProductSlug()
		selectedProductSlug.set(mockProducts[0].slug)

		routerOpenMock.mock.resetCalls()

		selectedProductSlug.set(null)

		assert.strictEqual(selectedProductSlug.value.get(), null)
		assert.strictEqual(selectedProductSlug.lastSelected.get(), mockProducts[0].slug)
		assert.strictEqual(routerOpenMock.mock.callCount(), 0)
	})

	test('reset clears current value without changing lastSelected', () => {
		const selectedProductSlug = createSelectedProductSlug()
		selectedProductSlug.set(mockProducts[0].slug)

		routerOpenMock.mock.resetCalls()
		selectedProductSlug.reset()

		assert.strictEqual(selectedProductSlug.value.get(), null)
		assert.strictEqual(selectedProductSlug.lastSelected.get(), mockProducts[0].slug)
		assert.strictEqual(routerOpenMock.mock.callCount(), 0)
	})

	test('route change away from product clears current value', () => {
		const selectedProductSlug = createSelectedProductSlug()
		selectedProductSlug.set(mockProducts[0].slug)

		routerOpenMock.mock.resetCalls()
		$router.open(HOME.url)

		assert.strictEqual(selectedProductSlug.value.get(), null)
		assert.strictEqual(selectedProductSlug.lastSelected.get(), mockProducts[0].slug)
		assert.strictEqual(routerOpenMock.mock.callCount(), 1)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [HOME.url])
	})

	test('route change to product does not clear current value', () => {
		const selectedProductSlug = createSelectedProductSlug()
		selectedProductSlug.set(mockProducts[0].slug)

		routerOpenMock.mock.resetCalls()
		$router.open(PRODUCT.url)

		assert.strictEqual(selectedProductSlug.value.get(), mockProducts[0].slug)
		assert.strictEqual(selectedProductSlug.lastSelected.get(), mockProducts[0].slug)
		assert.strictEqual(routerOpenMock.mock.callCount(), 1)
		assert.deepStrictEqual(routerOpenMock.mock.calls[0].arguments, [PRODUCT.url])
	})
})

describe('$selectedProduct', () => {
	beforeEach(() => {
		$products.value.set(emptyProductsState())
		$selectedProductSlug.value.set(null)
	})

	test('returns null when no slug is selected', () => {
		$products.value.set(loadedMockProductsState)

		assert.strictEqual($selectedProduct.get(), null)
	})

	test('returns matched product for selected slug', () => {
		$products.value.set(loadedMockProductsState)
		$selectedProductSlug.value.set(mockProducts[0].slug)

		assert.deepStrictEqual($selectedProduct.get(), mockProducts[0])
	})

	test('returns null when selected slug does not exist in products data', () => {
		$products.value.set(loadedMockProductsState)
		$selectedProductSlug.value.set('missing-product')

		assert.strictEqual($selectedProduct.get(), null)
	})
})

describe('createSelectedModel', () => {
	beforeEach(() => {
		$products.value.set(emptyProductsState())
		$selectedProductSlug.value.set(null)
	})

	test('returns null when no product is selected', () => {
		$products.value.set(loadedMockProductsState)
		const selectedModel = createSelectedModel()

		assert.strictEqual(selectedModel.value.get(), null)
	})

	test('returns first model when no model id is selected', () => {
		$products.value.set(loadedMockProductsState)
		$selectedProductSlug.value.set(mockProducts[0].slug)
		const selectedModel = createSelectedModel()

		assert.deepStrictEqual(selectedModel.value.get(), mockModels.airMax90Mens)
	})

	test('returns matched model after setId', () => {
		$products.value.set(loadedMockProductsState)
		$selectedProductSlug.value.set(mockProducts[0].slug)
		const selectedModel = createSelectedModel()

		selectedModel.setId(mockModels.airMax90Gs.id)

		assert.deepStrictEqual(selectedModel.value.get(), mockModels.airMax90Gs)
	})

	test('returns null when selected model id does not exist in selected product', () => {
		$products.value.set(loadedMockProductsState)
		$selectedProductSlug.value.set(mockProducts[0].slug)
		const selectedModel = createSelectedModel()

		selectedModel.setId('missing-model')

		assert.strictEqual(selectedModel.value.get(), null)
	})

	test('falls back to the first model of the new product when selected slug changes', () => {
		$products.value.set(loadedMockProductsState)
		$selectedProductSlug.value.set(mockProducts[0].slug)
		const selectedModel = createSelectedModel()

		selectedModel.setId(mockModels.airMax90Gs.id)
		assert.deepStrictEqual(selectedModel.value.get(), mockModels.airMax90Gs)

		$selectedProductSlug.value.set(mockProducts[1].slug)

		assert.deepStrictEqual(selectedModel.value.get(), mockModels.pegasus41)
	})

	test('returns null when selected product has no models', () => {
		$products.value.set(loadedMockProductsState)
		$selectedProductSlug.value.set(mockProducts[2].slug)
		const selectedModel = createSelectedModel()

		assert.strictEqual(selectedModel.value.get(), null)
	})
})
