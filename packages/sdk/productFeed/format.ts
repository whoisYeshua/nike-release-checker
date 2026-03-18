import type { LevelOutput, ProductFeedOutput, ProductInfoOutput } from './schema.ts'

interface Size {
	id: string
	gtin: string
	size: string
	level: LevelOutput
}

type Release = ReturnType<typeof getRelease>

export const formatProductFeedResponse = (productsFeed: ProductFeedOutput[]) => {
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

	const dedupedReleases = dedupeReleasesBySlug(releasesWithoutTopChilds)

	return dedupedReleases.toSorted(compareByStartEntryDate)
}

const dedupeReleasesBySlug = (releases: Release[]) => {
	const seenSlugs = new Set<string>()

	return releases.filter(({ slug }) => {
		if (!slug) return false
		if (seenSlugs.has(slug)) return false
		seenSlugs.add(slug)
		return true
	})
}

const compareByStartEntryDate = (aRelease: Release, bRelease: Release) => {
	const dateA = aRelease.models[0]?.launchView?.startEntryDate
	const dateB = bRelease.models[0]?.launchView?.startEntryDate
	if (dateA && dateB)
		return dateA.localeCompare(dateB) || aRelease.title.localeCompare(bRelease.title)
	if (dateA) return -1
	if (dateB) return 1
	return aRelease.title.localeCompare(bRelease.title)
}

const getRelease = (productFeed: ProductFeedOutput) => ({
	...productFeed,
	slug: productFeed.publishedContent.properties.seo.slug,
	title: productFeed.publishedContent.properties.coverCard.properties.title,
	imageUrl: productFeed.publishedContent.properties.coverCard.properties.squarishURL,
	models: productFeed.productInfo
		.map(getProductModel)
		.toSorted(
			(a, b) =>
				getModelPriority(a.modelName) - getModelPriority(b.modelName) ||
				a.modelName.localeCompare(b.modelName)
		),
})

const isChildSize = (name: string, type: 'GS' | 'PS' | 'TD') => {
	return new RegExp(`\\(${type}\\)|\\b${type}\\b`).test(name)
}
const getModelPriority = (name: string) => {
	if (isChildSize(name, 'GS')) return 1
	if (isChildSize(name, 'PS')) return 2
	if (isChildSize(name, 'TD')) return 3
	return 0
}

const getProductModel = (product: ProductInfoOutput) => ({
	...product,
	modelName: product.merchProduct.labelName,
	id: product.merchProduct.id,
	sizes: getSizes(product),
})

const getSizes = ({ skus, availableGtins }: ProductInfoOutput) => {
	const sizes: Size[] = []
	for (const { gtin, nikeSize, id } of skus ?? []) {
		const level = availableGtins?.find((available) => available.gtin === gtin)?.level
		if (!level) continue
		sizes.push({ id, gtin, size: nikeSize, level })
	}
	return sizes
}
