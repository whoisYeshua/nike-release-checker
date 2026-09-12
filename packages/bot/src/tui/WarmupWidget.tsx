/** @jsxImportSource react */
import { useEffect, useState, type FC } from 'react'
import { Box, Text } from 'ink'
import type { WarmupController, WarmupProgress } from '../monitor/warmupMode.ts'
import { useInterval } from './useInterval.ts'

// TODO: swap for `./primitives/Spinner.tsx` once Story 11-2 merges.
const Spinner: FC = () => <Text>...</Text>

function fmtCountdown(seconds: number): string {
	if (seconds <= 0) return 'T-00:00'
	const m = Math.floor(seconds / 60)
	const s = seconds % 60
	return `T-${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export interface WarmupWidgetProps {
	controller: WarmupController
	dropTime: Date
}

export const WarmupWidget: FC<WarmupWidgetProps> = ({ controller, dropTime }) => {
	const [prog, setProg] = useState<WarmupProgress>({
		phase: 'idle',
		tMinusSeconds: Number.POSITIVE_INFINITY,
	})
	const [countdown, setCountdown] = useState(() =>
		Math.round((dropTime.getTime() - Date.now()) / 1000),
	)

	useEffect(() => controller.on('progress', setProg), [controller])
	useInterval(
		() => setCountdown(Math.round((dropTime.getTime() - Date.now()) / 1000)),
		1000,
	)

	return (
		<Box flexDirection='column' padding={1}>
			<Box>
				<Text bold>Warmup — </Text>
				<Text color='cyan'>{fmtCountdown(countdown)}</Text>
			</Box>
			<Box marginTop={1} flexDirection='column'>
				<Row
					done={!!prog.slugResolved}
					active={prog.phase === 'polling'}
					label={`Slug resolved: ${prog.slugResolved ?? ''}`}
				/>
				<Row
					done={prog.sessionsValid !== undefined}
					active={prog.phase === 'sessions'}
					label={
						prog.sessionsValid !== undefined
							? `Sessions valid: ${prog.sessionsValid}/${prog.sessionsTotal}`
							: 'Validating sessions...'
					}
				/>
				<Row
					done={
						prog.contextsReady !== undefined &&
						prog.contextsReady === prog.sessionsTotal
					}
					active={prog.phase === 'contexts'}
					label={
						prog.contextsReady !== undefined
							? `Contexts ready: ${prog.contextsReady}/${prog.sessionsTotal}`
							: 'Pre-launching contexts...'
					}
				/>
			</Box>
			{prog.phase === 'ready' && (
				<Box marginTop={1}>
					<Text bold color='green'>
						Ready — drop starting.
					</Text>
				</Box>
			)}
			{prog.phase === 'collapsed' && (
				<Box marginTop={1}>
					<Text bold color='yellow'>
						Stock already live — drop starting immediately.
					</Text>
				</Box>
			)}
		</Box>
	)
}

interface RowProps {
	done: boolean
	active: boolean
	label: string
}

const Row: FC<RowProps> = ({ done, active, label }) => (
	<Box>
		<Text color={done ? 'green' : active ? 'yellow' : 'gray'}>
			{done ? '[v]' : active ? '[  ]' : '[ ]'}
		</Text>
		{active && !done ? (
			<Text>
				{' '}
				<Spinner />{' '}
			</Text>
		) : (
			<Text> </Text>
		)}
		<Text>{label}</Text>
	</Box>
)
