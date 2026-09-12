/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { stat, utimes, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseAccountsCsv } from '../../config/accountsCsv.ts'
import { validateSession } from '../../auth/sessionValidator.ts'
import { loadBotConfig } from '../../config/botConfig.ts'
import { loadSelectors } from '../../config/selectors.ts'
import { runCheckoutPipeline } from '../../checkout/checkoutPipeline.ts'

const DRY_RUN_FLAG_PATH = join(homedir(), '.nike-bot', '.last-dry-run')
const DRY_RUN_WINDOW_MS = 24 * 60 * 60 * 1000
const DRY_RUN_TEST_URL = 'https://www.nike.com/fr/launch/t/test-product'

export interface Step4Result {
	success: boolean
	skipped: boolean
	durationMs: number
	error?: string
}

export interface Step4Props {
	accountsCsvPath: string
	onDone: (result: Step4Result) => void
	// Test seam — when provided, bypasses real pipeline execution.
	runner?: () => Promise<{ success: boolean; durationMs: number; error?: string }>
}

async function flagIsRecent(): Promise<boolean> {
	try {
		const st = await stat(DRY_RUN_FLAG_PATH)
		return Date.now() - st.mtimeMs < DRY_RUN_WINDOW_MS
	} catch {
		return false
	}
}

async function touchFlag(): Promise<void> {
	await mkdir(join(homedir(), '.nike-bot'), { recursive: true })
	const now = new Date()
	try {
		await utimes(DRY_RUN_FLAG_PATH, now, now)
	} catch {
		await writeFile(DRY_RUN_FLAG_PATH, '', { encoding: 'utf8', mode: 0o600 })
	}
}

export function Step4DryRun({ accountsCsvPath, onDone, runner }: Step4Props) {
	const [phase, setPhase] = useState<'checking' | 'running' | 'done'>('checking')
	const [message, setMessage] = useState<string>('Checking for recent dry-run...')

	useEffect(() => {
		let cancelled = false
		void (async () => {
			if (await flagIsRecent()) {
				if (cancelled) return
				setPhase('done')
				setMessage('Recent dry-run detected (<24h) — skipping.')
				queueMicrotask(() =>
					onDone({ success: true, skipped: true, durationMs: 0 }),
				)
				return
			}

			setPhase('running')
			setMessage('Running checkout pipeline in dry-run mode...')

			const started = Date.now()
			try {
				if (runner) {
					const r = await runner()
					if (cancelled) return
					if (r.success) await touchFlag()
					setPhase('done')
					setMessage(r.success ? `Dry-run complete in ${r.durationMs}ms` : `Dry-run failed: ${r.error ?? 'unknown'}`)
					queueMicrotask(() => onDone({ ...r, skipped: false }))
					return
				}

				const { accounts, errors } = await parseAccountsCsv(accountsCsvPath)
				if (errors.length > 0 || accounts.length === 0) {
					throw new Error('No valid accounts to dry-run against')
				}

				// Find first account with a valid session.
				let chosen: typeof accounts[number] | undefined
				for (const a of accounts) {
					const v = await validateSession(a.account_id)
					if (v.status === 'valid') {
						chosen = a
						break
					}
				}
				if (!chosen) {
					throw new Error('No account has a valid session for dry-run')
				}

				const config = await loadBotConfig()
				const selectors = await loadSelectors()

				const result = await runCheckoutPipeline(
					{
						id: chosen.account_id,
						email: chosen.email,
						password: chosen.password,
						proxy: chosen.proxy_url,
						country: chosen.country,
						preferredSizes: chosen.preferred_sizes,
						paymentMethod: 'PRE_SAVED',
					},
					config,
					selectors,
					{
						productUrl: DRY_RUN_TEST_URL,
						targetSizes: chosen.preferred_sizes,
						dryRun: true,
					},
				)

				if (cancelled) return
				const success = result.finalOutcome === 'success'
				if (success) await touchFlag()
				setPhase('done')
				setMessage(success
					? `Dry-run complete in ${result.durationMs}ms`
					: `Dry-run ended in outcome: ${result.finalOutcome}`)
				queueMicrotask(() => onDone({
					success,
					skipped: false,
					durationMs: result.durationMs,
					error: success ? undefined : result.finalOutcome,
				}))
			} catch (err) {
				if (cancelled) return
				const durationMs = Date.now() - started
				setPhase('done')
				setMessage(`Dry-run failed: ${String(err)}`)
				queueMicrotask(() => onDone({ success: false, skipped: false, durationMs, error: String(err) }))
			}
		})()
		return () => {
			cancelled = true
		}
	}, [accountsCsvPath, onDone, runner])

	return (
		<Box flexDirection='column'>
			<Text>Step 4 of 5 — Dry-run</Text>
			<Box>
				{phase === 'running' ? <Spinner type='dots' /> : null}
				<Text> {message}</Text>
			</Box>
		</Box>
	)
}
