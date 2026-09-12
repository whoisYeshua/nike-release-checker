import { access, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import * as v from 'valibot'
import { SelectorsSchema, type Selectors } from './selectorSchema.ts'
import { dataDir } from './dataDir.ts'

const DEFAULT_SELECTORS_PATH = './selectors.yaml'

async function fileExists(p: string): Promise<boolean> {
	return access(p).then(() => true).catch(() => false)
}

/**
 * Locate the bundled selectors.example.yaml that ships inside the packaged app.
 * Resolution order:
 *   1. NIKE_BOT_APP_PATH/selectors.example.yaml (set by the launcher).
 *   2. sibling of this module / the bundled main.mjs (import.meta.url).
 *   3. the source tree (dev): packages/bot/selectors.example.yaml.
 */
function bundledExamplePath(): string | undefined {
	const candidates: string[] = []
	if (process.env.NIKE_BOT_APP_PATH) {
		candidates.push(join(process.env.NIKE_BOT_APP_PATH, 'selectors.example.yaml'))
	}
	try {
		const here = dirname(fileURLToPath(import.meta.url))
		// Bundled: main.mjs sits next to selectors.example.yaml in the app dir.
		candidates.push(join(here, 'selectors.example.yaml'))
		// Dev (src/config/ → package root).
		candidates.push(join(here, '..', '..', 'selectors.example.yaml'))
	} catch {
		// import.meta.url unavailable — ignore
	}
	return candidates.find((p) => existsSync(p))
}

/**
 * Resolve the selectors file. On a fresh install the user has no selectors.yaml
 * yet — fall back to the bundled selectors.example.yaml (read in place, no write
 * side-effect). This fixes the fresh-install failure where dry-run/run errored
 * with "Selectors file not found". The wizard separately seeds an editable
 * selectors.yaml into the data folder.
 */
async function resolveSelectorsPath(explicit?: string): Promise<string> {
	if (explicit && (await fileExists(explicit))) return explicit
	const inData = join(dataDir(), 'selectors.yaml')
	if (await fileExists(inData)) return inData
	if (await fileExists(DEFAULT_SELECTORS_PATH)) return DEFAULT_SELECTORS_PATH

	// Nothing user-provided — load the bundled example directly (no copy).
	const example = bundledExamplePath()
	if (example) return example

	// Last resort: the explicit/default path, so the error message is actionable.
	return explicit ?? DEFAULT_SELECTORS_PATH
}

export async function loadSelectors(selectorsPath?: string): Promise<Selectors> {
	const resolvedPath = await resolveSelectorsPath(selectorsPath)

	if (!(await fileExists(resolvedPath))) {
		throw new Error(
			`Selectors file not found: ${resolvedPath}\n` +
				`Copy selectors.example.yaml to selectors.yaml in your data folder (${dataDir()}) and customize if needed.`,
		)
	}

	const raw = await readFile(resolvedPath, 'utf-8')
	const parsed = parse(raw) as unknown

	try {
		return v.parse(SelectorsSchema, parsed)
	} catch (err) {
		if (err instanceof v.ValiError) {
			const flat = v.flatten(err.issues)
			const missingKeys = Object.keys(flat.nested ?? {})
			if (missingKeys.length > 0) {
				throw new Error(
					`Missing required selectors in ${resolvedPath}: ${missingKeys.join(', ')}`,
				)
			}
			throw new Error(`Invalid selectors file ${resolvedPath}:\n${err.message}`)
		}
		throw err
	}
}
