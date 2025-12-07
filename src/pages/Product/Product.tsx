import { useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

import { Image } from '../../components/Image.tsx'
import { Select } from '../../components/Select/Select.tsx'
import { $selectedModel, $selectedProduct, $selectedProductImage } from '../../store/product.ts'
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
	const model = useStore($selectedProductImage)

	if (model?.loading)
		return (
			<Box height={10} alignItems="center">
				<Spinner type="dots" />
				<Spinner type="dots" />
				<Spinner type="dots" />
			</Box>
		)

	if (model?.data) return <Image src={model.data} height={18} width={18} />
}
