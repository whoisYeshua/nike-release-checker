/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { generateTemplates } from './csvTemplates.ts'
import { parseAccountsCsv } from '../../config/accountsCsv.ts'
import { dataDir as sharedDataDir } from '../../config/dataDir.ts'

export interface CsvPaths {
	accounts: string
	cards: string
	addresses: string
	drop: string
}

export interface Step2Props {
	onDone: (paths: CsvPaths) => void
	/** Override the default `~/Downloads/nikebot` location (used by tests). */
	dataDir?: string
	/** Disable opening the OS file manager (used by tests). */
	autoOpenFolder?: boolean
}

function defaultDataDir(): string {
	// Single source of truth shared with the runtime commands (see config/dataDir.ts)
	// so the wizard writes the CSVs where `run`/`dry-run` later read them.
	return sharedDataDir()
}

function openInFileManager(folder: string): void {
	const platform = process.platform
	const cmd =
		platform === 'darwin' ? 'open'
		: platform === 'win32' ? 'explorer'
		: 'xdg-open'
	try {
		spawn(cmd, [folder], { stdio: 'ignore', detached: true }).unref()
	} catch {
		/* ignore — opening the folder is a convenience, not critical */
	}
}

type Status = 'init' | 'ready' | 'validating' | 'error'

export function Step2CsvPaths({ onDone, dataDir, autoOpenFolder = true }: Step2Props) {
	const folder = dataDir ?? defaultDataDir()
	const paths: CsvPaths = {
		accounts: join(folder, 'accounts.csv'),
		cards: join(folder, 'cards.csv'),
		addresses: join(folder, 'addresses.csv'),
		drop: join(folder, 'drop.csv'),
	}

	const [status, setStatus] = useState<Status>('init')
	const [info, setInfo] = useState<string>('')
	const [error, setError] = useState<string | undefined>(undefined)

	useEffect(() => {
		void (async () => {
			try {
				const { created, skipped } = await generateTemplates(folder)
				const parts: string[] = []
				if (created.length > 0) parts.push(`Created: ${created.join(', ')}`)
				if (skipped.length > 0) parts.push(`Already present: ${skipped.join(', ')}`)
				setInfo(parts.join(' — ') || 'Templates ready')
				if (autoOpenFolder) openInFileManager(folder)
				setStatus('ready')
			} catch (err) {
				setError(`Failed to create templates: ${(err as Error).message}`)
				setStatus('error')
			}
		})()
	}, [folder])

	useInput((_input, key) => {
		if (status !== 'ready' && status !== 'error') return
		if (!key.return) return

		setStatus('validating')
		setError(undefined)
		void (async () => {
			try {
				const { accounts, errors } = await parseAccountsCsv(paths.accounts)
				if (errors.length > 0) {
					const preview = errors
						.slice(0, 3)
						.map((e) => `row ${e.row} ${e.column}: ${e.message}`)
						.join('; ')
					setError(`accounts.csv has ${errors.length} error(s): ${preview}`)
					setStatus('error')
					return
				}
				if (accounts.length === 0) {
					setError(
						'accounts.csv has no rows yet. Open the file in the Downloads/nikebot folder, ' +
							'fill in at least one account, save, then press Enter again.',
					)
					setStatus('error')
					return
				}
				onDone(paths)
			} catch (err) {
				setError(`Failed to read accounts.csv: ${(err as Error).message}`)
				setStatus('error')
			}
		})()
	})

	return (
		<Box flexDirection="column">
			<Text>Step 2 of 5 — Configuration files (CSV)</Text>
			<Box marginTop={1}>
				<Text>Folder: <Text color="cyan">{folder}</Text></Text>
			</Box>
			<Text color="gray">  This folder has been opened in your file manager.</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>Files:</Text>
				<Text color="green">  • accounts.csv  — Nike accounts (login + proxy + country)</Text>
				<Text color="green">  • cards.csv     — payment cards (encrypted on import)</Text>
				<Text color="green">  • addresses.csv — shipping address per account</Text>
				<Text color="green">  • drop.csv      — drops to monitor (SKU + sizes)</Text>
				<Text color="gray">  • _HOW_TO_FILL.txt — explanation of every column</Text>
			</Box>
			<Box marginTop={1} flexDirection="column">
				{status === 'init' ? <Text color="yellow">Creating templates…</Text> : null}
				{info ? <Text color="gray">{info}</Text> : null}
				{status === 'ready' ? (
					<Text color="cyan">When you have filled in accounts.csv (at minimum), press Enter to continue.</Text>
				) : null}
				{status === 'validating' ? <Text color="yellow">Validating…</Text> : null}
				{status === 'error' && error ? <Text color="red">{error}</Text> : null}
				{status === 'error' ? <Text color="cyan">Edit the files, save, then press Enter to retry.</Text> : null}
			</Box>
		</Box>
	)
}
