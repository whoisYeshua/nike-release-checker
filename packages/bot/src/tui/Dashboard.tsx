/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { AccountRow } from './AccountRow.tsx'
import { globalBus, type AccountStatus } from './eventBus.ts'
import { AnimationsProvider } from './AnimationsContext.tsx'
import { CountAnimation } from './primitives/CountAnimation.tsx'

export interface RowState {
	accountId: string
	status: AccountStatus
	startedAt: number
	lastUpdateAt: number
}

export interface DashboardProps {
	sku: string
	sizes: string[]
	accountIds: string[]
	name?: string // optional pair name (display label)
	onFinished: (summary: { cops: number; failures: number; rows: RowState[] }) => void
}

export const Dashboard = ({ sku, sizes, accountIds, name, onFinished }: DashboardProps) => {
	const { exit } = useApp()
	const [rows, setRows] = useState<RowState[]>(
		accountIds.map((id) => ({
			accountId: id,
			status: { kind: 'pending' },
			startedAt: Date.now(),
			lastUpdateAt: Date.now(),
		})),
	)
	const [now, setNow] = useState(Date.now())
	const [finished, setFinished] = useState<{ cops: number; failures: number } | null>(null)

	// Clock tick for elapsed updates (500ms → ≥ 2 FPS)
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 500)
		return () => clearInterval(t)
	}, [])

	// Event bus subscription — only mutates state. Side effects (onFinished)
	// live in the dedicated useEffect below so the reducer stays pure (React
	// StrictMode runs reducers twice).
	useEffect(() => {
		const off = globalBus.on('accountStatusChanged', ({ accountId, status }) => {
			setRows((prev) =>
				prev.map((r) =>
					r.accountId === accountId
						? { ...r, status, lastUpdateAt: Date.now() }
						: r,
				),
			)
		})
		const off2 = globalBus.on('checkoutFinished', (sum) => {
			setFinished({ cops: sum.cops, failures: sum.failures })
		})
		return () => {
			off()
			off2()
		}
	}, [])

	// Fire onFinished exactly once with the freshest rows snapshot. Splitting
	// from the bus subscription guarantees we never call it inside a setState
	// reducer, and the `rows` dep ensures we read the latest state.
	useEffect(() => {
		if (!finished) return
		onFinished({ cops: finished.cops, failures: finished.failures, rows })
		// Clear so we don't re-fire when rows mutates afterwards.
		setFinished(null)
	}, [finished, rows, onFinished])

	useInput((_, key) => {
		if (key.escape) exit()
	})

	const cops = rows.filter((r) => r.status.kind === 'cop').length
	const fails = rows.filter((r) => r.status.kind === 'fail').length
	const inProgress = rows.length - cops - fails

	return (
		<AnimationsProvider>
			<Box flexDirection='column'>
				<Box>
					<Text bold>Drop: </Text>
					<Text color='cyan'>{name ? `${name} (${sku})` : sku}</Text>
					<Text> — Sizes: </Text>
					<Text>{sizes.join(', ')}</Text>
					<Text> — Accounts: </Text>
					<Text>{rows.length}</Text>
				</Box>
				<Box flexDirection='column' marginY={1}>
					{rows.map((r) => (
						<AccountRow
							key={r.accountId}
							accountId={r.accountId}
							status={r.status}
							elapsedMs={now - r.startedAt}
						/>
					))}
				</Box>
				<Box>
					<Text>Cops: </Text>
					<CountAnimation value={cops} color='green' />
					<Text>   Failed: </Text>
					<CountAnimation value={fails} color='red' />
					<Text>   In progress: </Text>
					<CountAnimation value={inProgress} color='yellow' />
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press ESC to abort new starts.</Text>
				</Box>
			</Box>
		</AnimationsProvider>
	)
}
