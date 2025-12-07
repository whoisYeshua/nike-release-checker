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
			<Text>
				<Text color="cyan" bold>
					{model.modelName}
				</Text>{' '}
				<Text color="gray">(id: {model.id})</Text>
			</Text>
			<Text>
				<Text>
					<Text color="gray">Method:</Text> {model.launchView?.method ?? 'N/A'}{' '}
				</Text>
				<Text>
					<Text color="gray">Price:</Text> {model.merchPrice.currentPrice}{' '}
					{model.merchPrice.currency}
				</Text>
			</Text>
			<Br />
			<DateView date={model?.launchView?.startEntryDate} type="start" />
			<DateView date={model?.launchView?.stopEntryDate} type="end" />
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
