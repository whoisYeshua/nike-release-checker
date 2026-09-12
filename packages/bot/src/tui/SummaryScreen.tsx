/** @jsxImportSource react */
import React from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { ReportStatus } from '../logger/reportWriter.ts'
import { openReportFolder } from './openReportFolder.ts'

/**
 * Local adapter type used by the summary screen. The checkout pipeline's
 * native result is `CheckoutPipelineResult` (see parallelCheckout.ts); callers
 * of this component are expected to adapt their results into this flat shape.
 * We intentionally avoid coupling the screen to the pipeline's internals.
 */
export interface CheckoutResult {
	accountId: string
	status: ReportStatus
	sku: string
	name?: string // optional human-friendly pair name (from drop.csv)
	size?: string
	orderNumber?: string
	errorReason?: string
	durationMs: number
}

/**
 * Format a duration in milliseconds as:
 * - `MM:SS`  when ≥ 60 000 ms
 * - `XX.Xs`  when < 60 000 ms
 */
export function formatDuration(ms: number): string {
	if (ms >= 60_000) {
		const totalSecs = Math.floor(ms / 1000)
		const m = Math.floor(totalSecs / 60)
		const s = String(totalSecs % 60).padStart(2, '0')
		return `${m}:${s}`
	}
	return `${(ms / 1000).toFixed(1)}s`
}

export interface SummaryScreenProps {
	results: CheckoutResult[]
	startedAt: Date
	endedAt: Date
	reportPath: string
	onRetry: (failedResults: CheckoutResult[]) => void
	onQuit: () => void
}

const STATUS_ORDER: readonly ReportStatus[] = [
	'COP',
	'SOLD_OUT',
	'BLOCKED',
	'THREEDS_TIMEOUT',
	'NO_SESSION',
	'ERROR',
]

const STATUS_COLOR: Record<ReportStatus, string> = {
	COP: 'green',
	SOLD_OUT: 'red',
	BLOCKED: 'yellow',
	THREEDS_TIMEOUT: 'magenta',
	NO_SESSION: 'yellow',
	ERROR: 'red',
}

export const SummaryScreen: React.FC<SummaryScreenProps> = ({
	results,
	startedAt,
	endedAt,
	reportPath,
	onRetry,
	onQuit,
}) => {
	const { exit } = useApp()

	const byStatus: Partial<Record<ReportStatus, CheckoutResult[]>> = {}
	for (const r of results) {
		;(byStatus[r.status] ??= []).push(r)
	}

	const cops = (byStatus['COP']?.length ?? 0)
	const total = results.length
	const durationMs = endedAt.getTime() - startedAt.getTime()
	const failedResults = results.filter((r) => r.status !== 'COP')
	const hasFailures = failedResults.length > 0

	useInput((input) => {
		const key = input.toLowerCase()
		if (key === 'r' && hasFailures) onRetry(failedResults)
		else if (key === 'o') openReportFolder(reportPath)
		else if (key === 'q') {
			onQuit()
			exit()
		}
	})

	return (
		<Box flexDirection='column' padding={1}>
			<Text bold>
				Drop complete — {cops} cops out of {total} accounts
			</Text>
			<Box marginTop={1} flexDirection='column'>
				{STATUS_ORDER.map((s) => {
					const count = byStatus[s]?.length ?? 0
					return (
						<Box key={s}>
							<Text color={STATUS_COLOR[s]}>{s.padEnd(18)}</Text>
							<Text>{count}</Text>
						</Box>
					)
				})}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Total duration: {formatDuration(durationMs)}</Text>
			</Box>
			<Text dimColor>Report saved: {reportPath}</Text>
			<Box marginTop={1}>
				{hasFailures ? (
					<Text>[R] Retry failed / [O] Open report folder / [Q] Quit</Text>
				) : (
					<Text>
						<Text dimColor>[R] Retry failed (no failures)</Text>
						<Text> / [O] Open report folder / [Q] Quit</Text>
					</Text>
				)}
			</Box>
		</Box>
	)
}
