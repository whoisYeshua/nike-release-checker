import { useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

import { Select } from '../components/Select/Select.tsx'
import { $products, $selectedProductSlug } from '../store/product.ts'
import { isEmpty } from '../utils/isEmpty.ts'

export const Home = () => {
	const { loading, data } = useStore($products.value)
	const lastSlug = useStore($selectedProductSlug.lastSelected)
	const productsList = useMemo(
		() =>
			data?.map((product) => ({
				value: product.slug,
				label: `${product.title} (${product.slug})`,
			})) ?? [],
		[data]
	)
	const initialIndex = useMemo(
		() =>
			Math.max(
				0,
				productsList.findIndex((item) => item.value === lastSlug)
			),
		[productsList, lastSlug]
	)

	if (loading) return <LoadingElement />

	if (isEmpty(productsList)) return <EmptyProductsElement />

	return (
		<Box flexDirection="column">
			<Text>Select Product: </Text>
			<Select
				items={productsList}
				initialIndex={initialIndex}
				onSelect={({ value }) => ($selectedProductSlug.value = value ?? null)}
			/>
		</Box>
	)
}

const EmptyProductsElement = () => <Text>No products found</Text>

const LoadingElement = () => (
	<Box>
		<Text color="#FF5C7D">
			<Spinner type="dots" />
		</Text>
		<Text> Loading</Text>
	</Box>
)
