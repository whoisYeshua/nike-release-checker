import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'

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

const mockMkdir = mock.fn(async (_path: string, _opts?: { recursive?: boolean }) => undefined)
const mockWriteFile = mock.fn(async (_path: string, _data: unknown) => undefined)
const mockRm = mock.fn(
	async (_path: string, _opts?: { recursive?: boolean; force?: boolean }) => undefined
)

mock.module('node:fs/promises', {
	namedExports: { mkdir: mockMkdir, writeFile: mockWriteFile, rm: mockRm },
})

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
	$selectedModel,
	$productImageCache,
	$selectedModelImage,
} = await import('./product.ts')

const makeOkResponse = (bytes = new Uint8Array([1, 2, 3, 4])) => ({
	ok: true,
	arrayBuffer: async () =>
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
})
const makeNotOkResponse = () => ({
	ok: false,
	arrayBuffer: async () => new ArrayBuffer(0),
})
const expectedPathFor = (modelId: string) =>
	path.join(tmpdir(), 'nike-release-checker', 'images', `${modelId}.bin`)

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

describe('$productImageCache - createProductImageCache', () => {
	let fetchMock: ReturnType<typeof mock.method>

	afterEach(() => {
		fetchMock.mock.restore()
	})

	beforeEach(() => {
		$selectedProductSlug.value.set(null)
		$productImageCache.set({})
		$products.value.set(loadedMockProductsState)
		mockMkdir.mock.resetCalls()
		mockWriteFile.mock.resetCalls()
		fetchMock = mock.method(globalThis, 'fetch', async () => makeOkResponse())
		keepMount($productImageCache)
	})

	test('does not fetch when no product is selected', async () => {
		await allTasks()

		assert.strictEqual(fetchMock.mock.callCount(), 0)
		assert.deepStrictEqual($productImageCache.get(), {})
	})

	test('does not fetch for a product with no models', async () => {
		$selectedProductSlug.value.set(mockProducts[2].slug) // calm-slide, models: []
		await allTasks()

		assert.strictEqual(fetchMock.mock.callCount(), 0)
		assert.deepStrictEqual($productImageCache.get(), {})
	})

	test('fetches image and stores tmp path for selected model', async () => {
		$selectedProductSlug.value.set(mockProducts[0].slug)
		await allTasks()

		const { airMax90Mens } = mockModels
		const expectedPath = expectedPathFor(airMax90Mens.id)
		assert.strictEqual(fetchMock.mock.callCount(), 1)
		assert.deepStrictEqual(fetchMock.mock.calls[0].arguments[0], airMax90Mens.imageUrl)
		assert.strictEqual(mockMkdir.mock.callCount(), 1)
		assert.deepStrictEqual(mockMkdir.mock.calls[0].arguments[1], { recursive: true })
		assert.strictEqual(mockWriteFile.mock.callCount(), 1)
		assert.strictEqual(mockWriteFile.mock.calls[0].arguments[0], expectedPath)
		assert.ok(Buffer.isBuffer(mockWriteFile.mock.calls[0].arguments[1]))
		assert.deepStrictEqual($productImageCache.get()[airMax90Mens.id], {
			loading: false,
			path: expectedPath,
		})
	})

	test('sets loading:true synchronously before fetch resolves', async () => {
		const { promise: fetchPromise, resolve: resolveFetch } =
			Promise.withResolvers<ReturnType<typeof makeOkResponse>>()
		fetchMock.mock.mockImplementation(() => fetchPromise)

		$selectedProductSlug.value.set(mockProducts[0].slug)

		assert.deepStrictEqual($productImageCache.get()[mockModels.airMax90Mens.id], {
			loading: true,
			path: null,
		})

		resolveFetch(makeOkResponse())
		await allTasks()
	})

	test('cache hit: does not re-fetch when switching back to already-loaded model', async () => {
		$selectedProductSlug.value.set(mockProducts[0].slug)
		await allTasks()

		$selectedModel.setId(mockModels.airMax90Gs.id)
		await allTasks()

		fetchMock.mock.resetCalls()

		$selectedModel.setId(mockModels.airMax90Mens.id)
		await allTasks()

		assert.strictEqual(fetchMock.mock.callCount(), 0)
	})

	test('caches separate entries for each model in the same product', async () => {
		$selectedProductSlug.value.set(mockProducts[0].slug)
		await allTasks()

		$selectedModel.setId(mockModels.airMax90Gs.id)
		await allTasks()

		const cache = $productImageCache.get()
		assert.deepStrictEqual(cache[mockModels.airMax90Mens.id], {
			loading: false,
			path: expectedPathFor(mockModels.airMax90Mens.id),
		})
		assert.deepStrictEqual(cache[mockModels.airMax90Gs.id], {
			loading: false,
			path: expectedPathFor(mockModels.airMax90Gs.id),
		})
	})

	test('clears cache when selected product changes', async () => {
		$selectedProductSlug.value.set(mockProducts[0].slug)
		await allTasks()

		$selectedProductSlug.value.set(mockProducts[1].slug)
		await allTasks()

		const cache = $productImageCache.get()
		assert.strictEqual(cache[mockModels.airMax90Mens.id], undefined)
		assert.deepStrictEqual(cache[mockModels.pegasus41.id], {
			loading: false,
			path: expectedPathFor(mockModels.pegasus41.id),
		})
	})

	test('handles non-ok response by setting loading:false and path:null', async () => {
		fetchMock.mock.mockImplementation(async () => makeNotOkResponse())

		$selectedProductSlug.value.set(mockProducts[0].slug)
		await allTasks()

		assert.deepStrictEqual($productImageCache.get()[mockModels.airMax90Mens.id], {
			loading: false,
			path: null,
		})
		assert.strictEqual(mockWriteFile.mock.callCount(), 0)
	})

	test('handles fetch throw by setting loading:false and path:null', async () => {
		fetchMock.mock.mockImplementation(async () => {
			throw new Error('network error')
		})

		$selectedProductSlug.value.set(mockProducts[0].slug)
		await allTasks()

		assert.deepStrictEqual($productImageCache.get()[mockModels.airMax90Mens.id], {
			loading: false,
			path: null,
		})
		assert.strictEqual(mockWriteFile.mock.callCount(), 0)
	})

	test('race guard: discards stale fetch result when product changes mid-fetch', async () => {
		const resolvers: Array<(r: ReturnType<typeof makeOkResponse>) => void> = []
		fetchMock.mock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolvers.push(resolve)
				})
		)

		$selectedProductSlug.value.set(mockProducts[0].slug) // air-max-90
		// nanostores fires $selectedProduct.listen (cache clear) before propagating to
		// $selectedModel.value subscribers (new fetch), so resolvers[0] is the stale air-max-90 fetch.
		$selectedProductSlug.value.set(mockProducts[1].slug) // pegasus-41

		resolvers.forEach((r) => r(makeOkResponse()))
		await allTasks()

		const cache = $productImageCache.get()
		assert.strictEqual(cache[mockModels.airMax90Mens.id], undefined)
		assert.deepStrictEqual(cache[mockModels.pegasus41.id], {
			loading: false,
			path: expectedPathFor(mockModels.pegasus41.id),
		})
		assert.strictEqual(mockWriteFile.mock.callCount(), 1)
		assert.strictEqual(
			mockWriteFile.mock.calls[0].arguments[0],
			expectedPathFor(mockModels.pegasus41.id)
		)
	})
})

describe('$selectedModelImage', () => {
	let fetchMock: ReturnType<typeof mock.method>

	afterEach(() => {
		fetchMock.mock.restore()
	})

	beforeEach(() => {
		$selectedProductSlug.value.set(null)
		$productImageCache.set({})
		$products.value.set(loadedMockProductsState)
		mockMkdir.mock.resetCalls()
		mockWriteFile.mock.resetCalls()
		fetchMock = mock.method(globalThis, 'fetch', async () => makeOkResponse())
		keepMount($productImageCache)
	})

	test('returns null when no product is selected', () => {
		assert.strictEqual($selectedModelImage.get(), null)
	})

	test('returns loading entry before fetch resolves', async () => {
		const { promise: fetchPromise, resolve: resolveFetch } =
			Promise.withResolvers<ReturnType<typeof makeOkResponse>>()
		fetchMock.mock.mockImplementation(() => fetchPromise)

		$selectedProductSlug.value.set(mockProducts[0].slug)

		assert.deepStrictEqual($selectedModelImage.get(), { loading: true, path: null })

		resolveFetch(makeOkResponse())
		await allTasks()
	})

	test('returns cache entry for selected model after fetch completes', async () => {
		$selectedProductSlug.value.set(mockProducts[0].slug)
		await allTasks()

		assert.deepStrictEqual($selectedModelImage.get(), {
			loading: false,
			path: expectedPathFor(mockModels.airMax90Mens.id),
		})
	})

	test('follows the selected model id when switching between models', async () => {
		$selectedProductSlug.value.set(mockProducts[0].slug)
		$selectedModel.setId(mockModels.airMax90Gs.id)
		await allTasks()

		$selectedModel.setId(mockModels.airMax90Mens.id)

		assert.deepStrictEqual($selectedModelImage.get(), {
			loading: false,
			path: expectedPathFor(mockModels.airMax90Mens.id),
		})

		$selectedModel.setId(mockModels.airMax90Gs.id)

		assert.deepStrictEqual($selectedModelImage.get(), {
			loading: false,
			path: expectedPathFor(mockModels.airMax90Gs.id),
		})
	})
})
