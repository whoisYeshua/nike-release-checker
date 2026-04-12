import { useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Box, Text } from 'ink'
import ProductImage from 'ink-picture'

import { Select } from '../../components/Select/Select.tsx'
import { $selectedModel, $selectedProduct } from '../../store/product.ts'
import { theme } from '../../utils/theme.ts'
import { Model } from './Model/Model.tsx'

export const Product = () => {
	const selectedProduct = useStore($selectedProduct)
	const selectOptions = useMemo(
		() =>
			selectedProduct?.models.map((model) => ({
				label: model.modelName,
				value: model.id,
			})) ?? [],
		[selectedProduct]
	)

	if (!selectedProduct) return <Text>No product selected</Text>

	return (
		<Box flexDirection="column">
			<Text>
				{' '.repeat(theme.sizes.image * 2 + 1)}
				<Text bold>{selectedProduct.title}</Text> (slug:{' '}
				<Text color="magenta">{selectedProduct.slug}</Text>)
			</Text>
			<ModelImage />
			<Box gap={2}>
				<Box
					flexDirection="column"
					borderStyle="single"
					borderTop={false}
					borderLeft={false}
					borderBottom={false}
					width={30}
				>
					<Text>Select model:</Text>
					<Select
						items={selectOptions}
						limit={undefined}
						onHighlight={({ value }) => {
							$selectedModel.setId(value)
						}}
					/>
				</Box>
				<Model />
			</Box>
		</Box>
	)
}

const ModelImage = () => {
	const selectedProduct = useStore($selectedProduct)

	if (!selectedProduct?.imageUrl) return null

	return (
		<Box height={6}>
			<ProductImage src={selectedProduct.imageUrl} />
		</Box>
	)
}
