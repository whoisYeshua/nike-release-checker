import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Config-folder resolution (cross-platform: macOS / Linux / Windows).
 *
 * SINGLE SOURCE OF TRUTH for where the editable CSVs live (accounts.csv,
 * cards.csv, addresses.csv, drop.csv). The setup wizard WRITES the templates
 * here and the runtime commands (run / dry-run / drop) READ from here, so a
 * drop.csv the user filled in is actually picked up.
 *
 * Resolution order:
 *   1. NIKE_BOT_DATA_DIR env override (per-invocation).
 *   2. Persisted choice in <NIKE_BOT_HOME>/settings.json (set via the app's
 *      "change folder" option) — lets the user target any folder.
 *   3. Default: <home>/Downloads/nikebot (same on all three OSes; Downloads is
 *      the easiest place for non-technical users to find).
 */

/** Where app settings (incl. the chosen data dir) are persisted. */
function settingsHome(): string {
	const envHome = process.env.NIKE_BOT_HOME
	if (envHome && envHome.trim() !== '') return envHome
	return join(homedir(), '.nike-bot')
}

function settingsPath(): string {
	return join(settingsHome(), 'settings.json')
}

/** The built-in default, identical across macOS / Linux / Windows. */
export function defaultDataDir(): string {
	return join(homedir(), 'Downloads', 'nikebot')
}

interface Settings {
	dataDir?: string
}

function readSettings(): Settings {
	try {
		const raw = readFileSync(settingsPath(), 'utf8')
		const parsed = JSON.parse(raw) as unknown
		if (parsed && typeof parsed === 'object') return parsed as Settings
	} catch {
		// no settings yet / unreadable → defaults
	}
	return {}
}

/** Resolve the active config folder (does not create it). */
export function dataDir(): string {
	const override = process.env.NIKE_BOT_DATA_DIR
	if (override && override.trim() !== '') return override
	const saved = readSettings().dataDir
	if (saved && saved.trim() !== '') return saved
	return defaultDataDir()
}

/** Persist a new config folder choice. Creates it if missing. Returns it. */
export function setDataDir(dir: string): string {
	const resolved = dir.trim()
	if (resolved === '') throw new Error('data dir must not be empty')
	mkdirSync(resolved, { recursive: true })
	const home = settingsHome()
	mkdirSync(home, { recursive: true })
	const settings = readSettings()
	settings.dataDir = resolved
	writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 })
	return resolved
}

/** Whether a non-default data dir has been explicitly configured. */
export function isDataDirConfigured(): boolean {
	if (process.env.NIKE_BOT_DATA_DIR?.trim()) return true
	const saved = readSettings().dataDir
	return Boolean(saved && saved.trim() !== '')
}

/** Absolute path to a config file inside the active data folder. */
export function dataFile(name: string): string {
	return join(dataDir(), name)
}

/** Does the active data folder exist on disk? */
export function dataDirExists(): boolean {
	return existsSync(dataDir())
}
