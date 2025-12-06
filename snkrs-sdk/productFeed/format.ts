import type { Level, ProductFeed, ProductInfo } from './model.ts'

interface Size {
	id: string
	gtin: string
	size: string
	level: Level
}

export const formatProductFeedResponse = (productsFeed: ProductFeed[]) => {
	const initialReleases = productsFeed.map(getRelease)
	const potentialChildReleases: string[] = []

	for (const release of initialReleases) {
		const modelsIds = release.models.map(({ id }) => id)
		if (modelsIds.length > 1) {
			potentialChildReleases.push(...modelsIds)
		}
	}

	const releasesWithoutTopChilds = initialReleases.filter((release) => {
		const modelsIds = release.models.map(({ id }) => id)
		const hasManyModels = modelsIds.length > 1
		const isNotTopChild = !potentialChildReleases.includes(modelsIds[0])
		return hasManyModels || isNotTopChild
	})

	return releasesWithoutTopChilds.toSorted((a, b) => a.title.localeCompare(b.title))
}

const getRelease = (productFeed: ProductFeed) => ({
	...productFeed,
	slug: productFeed.publishedContent.properties.seo.slug,
	title: productFeed.publishedContent.properties.coverCard.properties.title,
	imageUrl: productFeed.publishedContent.properties.coverCard.properties.squarishURL,
	models: productFeed.productInfo
		.map(getProductModel)
		.toSorted(
			(a, b) =>
				getPriority(a.modelName) - getPriority(b.modelName) ||
				a.modelName.localeCompare(b.modelName)
		),
})

const isChildSize = (name: string, type: 'GS' | 'PS' | 'TD') => {
	return new RegExp(`\\(${type}\\)|\\b${type}\\b`).test(name)
}
const getPriority = (name: string) => {
	if (isChildSize(name, 'GS')) return 1
	if (isChildSize(name, 'PS')) return 2
	if (isChildSize(name, 'TD')) return 3
	return 0
}

const getProductModel = (product: ProductInfo) => ({
	...product,
	modelName: product.merchProduct.labelName,
	id: product.merchProduct.id,
	sizes: getSizes(product),
})

const getSizes = ({ skus, availableGtins }: ProductInfo) => {
	const sizes: Size[] = []
	for (const { gtin, nikeSize, id } of skus) {
		const level = availableGtins?.find((available) => available.gtin === gtin)?.level
		if (!level) continue
		sizes.push({ id, gtin, size: nikeSize, level })
	}
	return sizes
}
