/** @jsxImportSource react */
import { Box, Text } from 'ink'
import type { AccountStatus } from './eventBus.ts'
import { FadeHighlight } from './primitives/FadeHighlight.tsx'
import { Spinner } from './primitives/Spinner.tsx'

const TRUNC = 16

function trunc(s: string, n = TRUNC): string {
	return s.length <= n ? s.padEnd(n) : s.slice(0, n - 1) + '…'
}

function iconColor(status: AccountStatus): string {
	switch (status.kind) {
		case 'cop':
			return 'green'
		case 'waiting':
			return 'yellow'
		case 'retrying':
			return 'cyan'
		case 'fail':
			return 'red'
		case 'pending':
			return 'gray'
	}
}

function staticGlyph(status: AccountStatus): string {
	switch (status.kind) {
		case 'cop':
			return '✓'
		case 'waiting':
			return '⏳'
		case 'retrying':
			return '🔄'
		case 'fail':
			return '✗'
		case 'pending':
			return '…'
	}
}

export interface AccountRowProps {
	accountId: string
	status: AccountStatus
	elapsedMs?: number
}

export const AccountRow = ({ accountId, status, elapsedMs }: AccountRowProps) => {
	const color = iconColor(status)
	const stepLabel =
		status.kind === 'waiting'
			? status.step
			: status.kind === 'retrying'
				? `${status.step} (attempt ${status.attempt})`
				: status.kind === 'cop'
					? `COP size ${status.size}`
					: status.kind === 'fail'
						? status.reason
						: 'pending'
	const detail =
		status.kind === 'cop' && status.orderNumber ? `order ${status.orderNumber}` : ''
	const elapsed = elapsedMs !== undefined ? `${(elapsedMs / 1000).toFixed(1)}s` : ''

	const flashColor: 'green' | 'red' | 'yellow' =
		status.kind === 'cop' ? 'green' : status.kind === 'fail' ? 'red' : 'yellow'

	const detailTruncated = detail.length > 20 ? detail.slice(0, 19) + '…' : detail

	return (
		<FadeHighlight triggerKey={status.kind} color={flashColor}>
			<Box>
				<Text>{trunc(accountId)}</Text>
				<Text color={color}> </Text>
				{status.kind === 'waiting' ? (
					<Spinner />
				) : (
					<Text color={color}>{staticGlyph(status)}</Text>
				)}
				<Text color={color}> </Text>
				<Text>{stepLabel.padEnd(20).slice(0, 20)}</Text>
				<Text dimColor> {elapsed.padStart(6)} </Text>
				<Text>{detailTruncated}</Text>
			</Box>
		</FadeHighlight>
	)
}
