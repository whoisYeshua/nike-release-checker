/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'

export interface StepSummaryProps {
	authenticated: number
	failed: number
	dryRunSuccess: boolean
	dryRunSkipped: boolean
	onExit: () => void
	countdownSec?: number
}

export function StepSummary({
	authenticated,
	failed,
	dryRunSuccess,
	dryRunSkipped,
	onExit,
	countdownSec = 3,
}: StepSummaryProps) {
	const [remaining, setRemaining] = useState(countdownSec)

	useEffect(() => {
		if (remaining <= 0) {
			onExit()
			return
		}
		const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
		return () => clearTimeout(t)
	}, [remaining, onExit])

	const dryRunLabel = dryRunSkipped ? 'skipped' : dryRunSuccess ? 'success' : 'fail'

	return (
		<Box flexDirection='column'>
			<Text color='green'>Step 5 of 5 — Setup complete</Text>
			<Text>  Accounts authenticated: {authenticated}</Text>
			{failed > 0 ? <Text color='red'>  Accounts failed: {failed}</Text> : null}
			<Text>  Dry-run: {dryRunLabel}</Text>
			<Text color='gray'>Exiting in {remaining}s...</Text>
		</Box>
	)
}
