import { useStore } from '@nanostores/react'
import { Box, Text } from 'ink'

import { $selectedModel } from '../../../store/product.ts'
import { DateView } from './DateView.tsx'
import { SizeItem } from './SizeItem.tsx'

export const Model = () => {
	const model = useStore($selectedModel.value)

	if (!model) return <Text>No model available</Text>

	return (
		<Box flexDirection="column">
			<Box>
				<Text color="cyan" bold>
					{model.modelName}
				</Text>
				<Text color="gray"> (id: {model.id})</Text>
			</Box>
			<Box>
				<Text color="gray"> Method: </Text>
				<Text>{model.launchView?.method ?? 'N/A'} </Text>
				<Text color="gray">Price: </Text>
				<Text>
					{model.merchPrice.currentPrice} {model.merchPrice.currency}
				</Text>
			</Box>
			<Br />
			<Box height={2} flexDirection="column">
				<DateView date={model?.launchView?.startEntryDate} type="start" />
				<DateView date={model?.launchView?.stopEntryDate} type="end" />
			</Box>
			<Br />
			<Text>Size - stock:</Text>
			<Box flexWrap="wrap" flexDirection="column" columnGap={4} height={7}>
				{model.sizes.map((size) => (
					<SizeItem key={size.id} size={size.size} stock={size.level} />
				))}
			</Box>
		</Box>
	)
}

const Br = () => <Text> </Text>
