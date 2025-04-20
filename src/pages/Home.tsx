import { useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { isEmpty } from 'radash'

import { Select } from '../components/Select/Select.tsx'
import { $products, $selectedProductSlug } from '../store/product.ts'

export const Home = () => {
	const { loading, data } = useStore($products.value)
	const productsList = useMemo(
		() =>
			data?.map((product) => ({
				value: product.slug,
				label: `${product.title} (${product.slug})`,
			})) ?? [],
		[data]
	)

	if (loading) return <LoadingElement />

	if (isEmpty(productsList)) return <EmptyProductsElement />

	return (
		<Box flexDirection="column">
			<Text>Select Product: </Text>
			<Select
				items={productsList}
				limit={27}
				onSelect={({ value }) => ($selectedProductSlug.value = value)}
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
