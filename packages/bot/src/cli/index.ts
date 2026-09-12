#!/usr/bin/env node
import { program } from './commands.ts'

function shouldSkipChromiumCheck(argv: readonly string[]): boolean {
	// Skip for --version / --help / install-browser / no-args, so those commands
	// never trigger a ~150MB download.
	const args = argv.slice(2)
	if (args.length === 0) return true
	for (const a of args) {
		if (a === '--version' || a === '-V' || a === '--help' || a === '-h' || a === 'help') return true
		if (a === 'install-browser' || a === 'status' || a === 'cards' || a === 'accounts' || a === 'kpsdk-stats' || a === 'stop') return true
	}
	return false
}

/**
 * Is the bot already set up? True when at least one account has been imported.
 * Used to decide between the first-run setup wizard and the home menu.
 */
async function isConfigured(): Promise<boolean> {
	try {
		const { loadStoredAccounts } = await import('../auth/accountManager.ts')
		const accounts = await loadStoredAccounts()
		return accounts.length > 0
	} catch {
		return false
	}
}

/** Count active (non-comment, non-empty) data rows in a CSV file. */
async function countCsvRows(path: string): Promise<number> {
	try {
		const { readFile } = await import('node:fs/promises')
		const raw = await readFile(path, 'utf8')
		const lines = raw.split('\n').map((l) => l.trim())
		// Drop blank lines, comments, and the header row.
		const data = lines.filter((l) => l.length > 0 && !l.startsWith('#'))
		return Math.max(0, data.length - 1)
	} catch {
		return 0
	}
}

/** First imported account id (used to target capture-session). */
async function firstAccountId(): Promise<string | undefined> {
	try {
		const { loadStoredAccounts } = await import('../auth/accountManager.ts')
		const accounts = await loadStoredAccounts()
		return accounts[0]?.id
	} catch {
		return undefined
	}
}

/** Show status inline, then wait for a keypress so the user can read it. */
async function showStatusInline(): Promise<void> {
	try {
		const { getBotStatus, printBotStatus } = await import('../daemon/botStatus.ts')
		const status = await getBotStatus()
		printBotStatus(status)
	} catch (err) {
		console.error('Status unavailable:', (err as Error).message)
	}
	await waitForKey('\nPress Enter to return to the menu…')
}

/** Block until the user presses a key (Enter). Resolves immediately if no TTY. */
async function waitForKey(prompt: string): Promise<void> {
	if (!process.stdin.isTTY) return
	process.stdout.write(prompt + '\n')
	await new Promise<void>((resolve) => {
		const stdin = process.stdin
		const onData = () => {
			stdin.removeListener('data', onData)
			try { stdin.setRawMode?.(false) } catch {}
			stdin.pause()
			resolve()
		}
		try { stdin.setRawMode?.(true) } catch {}
		stdin.resume()
		stdin.once('data', onData)
	})
}

/**
 * Home loop for an already-configured install. Shows the menu, handles
 * read-only actions inline (status, change folder) and RETURNS to the menu,
 * and for operate-actions (run / dry-run / capture / reconfigure) resolves the
 * argv to dispatch. Returns [] to exit the app.
 *
 * This is what fixes "the app quits after one action / I can't go back".
 */
async function resolveHomeAction(): Promise<string[]> {
	const { runMainMenu } = await import('./wizard/MainMenu.tsx')
	const { dataFile } = await import('../config/dataDir.ts')

	for (;;) {
		const dropCount = await countCsvRows(dataFile('drop.csv'))
		const accountCount = await (async () => {
			try {
				const { loadStoredAccounts } = await import('../auth/accountManager.ts')
				return (await loadStoredAccounts()).length
			} catch {
				return 0
			}
		})()

		const choice = await runMainMenu({
			accountCount,
			dropCount,
			items: [
				{ label: 'Launch drops', value: 'run', hint: 'run drop.csv (live dashboard)' },
				{ label: 'Test without ordering (dry-run)', value: 'run:dry', hint: 'same flow, no payment' },
				{ label: 'Account & session status', value: 'status', hint: 'returns to menu afterward' },
				{ label: 'Capture / refresh session', value: 'capture', hint: 'manual Nike login' },
				{ label: 'Configuration directory (CSV)', value: 'folder', hint: 'change CSV files location' },
				{ label: 'Reconfigure (setup wizard)', value: 'init', hint: 'accounts, cards, addresses' },
				{ label: 'Quit', value: 'exit', hint: '' },
			],
		})

		switch (choice) {
			// Read-only / settings actions: handle inline, then LOOP back to the menu.
			case 'status':
				await showStatusInline()
				continue
			case 'folder': {
				const { runDataDirScreen } = await import('./wizard/DataDirScreen.tsx')
				await runDataDirScreen()
				continue
			}
			// Operate actions: dispatch the matching command and leave the loop.
			case 'run':
				// Armed for a real drop: keep re-attempting (polling the feed +
				// reloading the PDP) until the pair goes live — up to 1h — so the bot
				// catches the exact drop second and cops automatically.
				return ['run', '--wait-live', '3600']
			case 'run:dry':
				// Single pass over EVERY drop, no auto-refresh — a quick test that
				// each pair resolves and the flow runs, without spinning the machine.
				return ['run', '--dry-run']
			case 'capture': {
				const id = await firstAccountId()
				if (!id) {
					console.error('No accounts imported. Run "Reconfigure" first.')
					continue
				}
				return ['capture-session', '--account', id]
			}
			case 'init':
				return ['init']
			default:
				return []
		}
	}
}

async function ensureChromiumReady(argv: readonly string[]): Promise<void> {
	if (shouldSkipChromiumCheck(argv)) return
	try {
		// Probe without importing the ink-based UI; firstRun.tsx pulls in
		// `ink`, which is external in the SEA bundle and would throw
		// "No such built-in module: ink" on every command otherwise.
		const { isChromiumInstalled } = await import('../installer/chromiumInstaller.ts')
		if (!isChromiumInstalled()) {
			const { ensureChromium } = await import('./firstRun.tsx')
			await ensureChromium()
		}
	} catch (err) {
		console.error('Chromium not available:', (err as Error).message)
	}
}

async function main(): Promise<void> {
	// Explicit command on the CLI → run it once and exit (scripting / power users).
	if (process.argv.length > 2) {
		await ensureChromiumReady(process.argv)
		await program.parseAsync(process.argv)
		return
	}

	// No args. Fresh install → setup wizard. Otherwise → the HOME MENU LOOP.
	if (!(await isConfigured())) {
		await ensureChromiumReady(['node', 'nike-bot', 'init'])
		await program.parseAsync(['node', 'nike-bot', 'init'])
		return
	}

	// The home menu needs a real terminal (raw-mode keyboard input). When
	// launched without a TTY (piped/CI), print the commands and exit.
	if (!process.stdin.isTTY) {
		console.log('Nike Bot — already configured. Available commands:')
		console.log('  nike-bot run                            # launch drops (drop.csv)')
		console.log('  nike-bot run --dry-run                  # test without ordering')
		console.log('  nike-bot status                         # account & session status')
		console.log('  nike-bot capture-session --account <id> # capture/refresh session')
		console.log('  nike-bot init                           # reconfigure')
		return
	}

	// HOME LOOP: after any action completes, come BACK to the menu instead of
	// quitting. Operate-actions (run / capture / init) dispatch their command and
	// return here when done; read-only actions (status / folder) are handled
	// inline inside resolveHomeAction. Only "Quit" leaves the app.
	for (;;) {
		const action = await resolveHomeAction()
		if (action.length === 0) return // Quit
		const argv = ['node', 'nike-bot', ...action]
		await ensureChromiumReady(argv)
		try {
			await program.parseAsync(argv)
		} catch (err) {
			console.error(`\n❌ ${(err as Error).message}`)
		}
		// brief pause so the user sees the command's final output before the menu
		// repaints over it.
		await new Promise((r) => setTimeout(r, 400))
	}
}

main().catch((err: unknown) => {
	console.error(err)
	process.exit(1)
})
