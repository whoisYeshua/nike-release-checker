/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { parseAccountsCsv } from '../../config/accountsCsv.ts'
import { authenticateSingle } from '../../auth/accountManager.ts'
import { validateSession } from '../../auth/sessionValidator.ts'

export type SessionRowStatus = 'pending' | 'capturing' | 'ok' | 'reused' | 'fail'

export interface SessionRow {
	accountId: string
	email: string
	status: SessionRowStatus
	error?: string
}

export interface Step3Result {
	authenticated: number
	failed: number
	rows: SessionRow[]
}

export interface Step3Props {
	accountsCsvPath: string
	onDone: (result: Step3Result) => void
	// Optional hooks used exclusively for tests to avoid real network/browser work.
	runCapture?: (accountId: string) => Promise<{ success: boolean; error?: string }>
	isSessionValid?: (accountId: string) => Promise<boolean>
}

const MAX_CONCURRENCY = 3

async function defaultIsValid(accountId: string): Promise<boolean> {
	const result = await validateSession(accountId)
	return result.status === 'valid'
}

async function defaultRunCapture(accountId: string) {
	const result = await authenticateSingle(accountId)
	return { success: result.success, error: result.error }
}

export function Step3SessionCapture({
	accountsCsvPath,
	onDone,
	runCapture = defaultRunCapture,
	isSessionValid = defaultIsValid,
}: Step3Props) {
	const [rows, setRows] = useState<SessionRow[]>([])
	const [loadError, setLoadError] = useState<string | undefined>(undefined)
	const [accountIds, setAccountIds] = useState<string[] | undefined>(undefined)

	useEffect(() => {
		let cancelled = false
		void (async () => {
			try {
				const { accounts, errors } = await parseAccountsCsv(accountsCsvPath)
				if (errors.length > 0) {
					setLoadError(`accounts.csv has ${errors.length} error(s) — fix and re-run init`)
					return
				}
				if (cancelled) return
				const initial: SessionRow[] = accounts.map((a) => ({
					accountId: a.account_id,
					email: a.email,
					status: 'pending',
				}))
				setRows(initial)
				setAccountIds(accounts.map((a) => a.account_id))
			} catch (err) {
				setLoadError(String(err))
			}
		})()
		return () => {
			cancelled = true
		}
	}, [accountsCsvPath])

	useEffect(() => {
		if (!accountIds) return
		const ids = accountIds
		let cancelled = false

		const updateRow = (id: string, patch: Partial<SessionRow>) => {
			if (cancelled) return
			setRows((prev) => prev.map((r) => (r.accountId === id ? { ...r, ...patch } : r)))
		}

		void (async () => {

			// Track outcomes locally so the final tally does not depend on a racy
			// setState re-read after the async workers finish.
			const outcomes = new Map<string, SessionRowStatus>()

			let cursor = 0
			const workers: Promise<void>[] = []

			const runOne = async () => {
				while (true) {
					const idx = cursor++
					if (idx >= ids.length || cancelled) return
					const id = ids[idx]!

					let reused = false
					try {
						reused = await isSessionValid(id)
					} catch {
						reused = false
					}
					if (reused) {
						outcomes.set(id, 'reused')
						updateRow(id, { status: 'reused' })
						continue
					}

					updateRow(id, { status: 'capturing' })
					try {
						const result = await runCapture(id)
						if (result.success) {
							outcomes.set(id, 'ok')
							updateRow(id, { status: 'ok' })
						} else {
							outcomes.set(id, 'fail')
							updateRow(id, { status: 'fail', error: result.error ?? 'unknown error' })
						}
					} catch (err) {
						outcomes.set(id, 'fail')
						updateRow(id, { status: 'fail', error: String(err) })
					}
				}
			}

			const parallel = Math.min(MAX_CONCURRENCY, Math.max(1, ids.length))
			for (let i = 0; i < parallel; i++) workers.push(runOne())
			await Promise.all(workers)

			if (cancelled) return

			let authenticated = 0
			let failed = 0
			const rowsSnapshot: SessionRow[] = ids.map((id) => {
				const status = outcomes.get(id) ?? 'pending'
				if (status === 'ok' || status === 'reused') authenticated++
				if (status === 'fail') failed++
				return { accountId: id, email: '', status }
			})
			onDone({ authenticated, failed, rows: rowsSnapshot })
		})()

		return () => {
			cancelled = true
		}
	}, [accountIds, onDone, runCapture, isSessionValid])

	if (loadError) {
		return (
			<Box flexDirection='column'>
				<Text color='red'>Step 3 — Failed to load accounts: {loadError}</Text>
			</Box>
		)
	}

	return (
		<Box flexDirection='column'>
			<Text>Step 3 of 5 — Session capture (max {MAX_CONCURRENCY} in parallel)</Text>
			{rows.map((row) => (
				<Box key={row.accountId}>
					<Text>{renderStatusIcon(row.status)} </Text>
					<Text>{row.accountId} ({row.email}) </Text>
					<Text color={statusColor(row.status)}>{row.status}</Text>
					{row.error ? <Text color='red'> — {row.error}</Text> : null}
				</Box>
			))}
		</Box>
	)
}

function renderStatusIcon(status: SessionRowStatus) {
	if (status === 'capturing') return <Spinner type='dots' />
	if (status === 'ok') return <Text color='green'>[ok]</Text>
	if (status === 'reused') return <Text color='cyan'>[~]</Text>
	if (status === 'fail') return <Text color='red'>[x]</Text>
	return <Text color='gray'>[ ]</Text>
}

function statusColor(status: SessionRowStatus): string {
	if (status === 'ok') return 'green'
	if (status === 'reused') return 'cyan'
	if (status === 'fail') return 'red'
	if (status === 'capturing') return 'yellow'
	return 'gray'
}
