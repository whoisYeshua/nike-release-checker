import { writeFile, chmod, access, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ACCOUNTS_TEMPLATE = 'account_id,email,password,proxy_url,country,preferred_sizes\n'

const CARDS_TEMPLATE = 'account_id,card_number,expiry,cvv,holder_name\n'

const ADDRESSES_TEMPLATE = 'account_id,firstName,lastName,email,street,city,zip,country,phone\n'

// `name` sits right after `sku` (next to the SKU it labels) so it's intuitive to
// fill. Parsing is by header, so column order is flexible — but keep this stable.
const DROP_TEMPLATE = 'sku,name,sizes,accounts_filter,country\n'

const INSTRUCTIONS = `Nike Bot — how to fill the CSV files
======================================

Open each .csv with Numbers, Excel, LibreOffice Calc, or any text editor.
Add ONE row per account / card / address / drop. Do NOT remove the first
line (the header). Do NOT add any line starting with #.

----------------------------------------------------------------------
accounts.csv
----------------------------------------------------------------------
Columns:
  account_id        unique short id you choose, e.g. kev_001
                    (letters, digits, underscore, hyphen)
  email             Nike login email
  password          Nike login password (stored locally only)
  proxy_url         optional. Paste it in ANY of these forms — the bot converts it:
                      host:port:user:pass   (WebShare CSV export — just paste as-is)
                      http://user:pass@host:port
                      socks5://host:port
                      host:port             (no auth)
                    leave empty if you don't use a proxy
  country           ISO 2-letter code, e.g. FR, US, DE, JP
  preferred_sizes   sizes separated by ";"   e.g.   42;42.5;43

Example rows:
  kev_001,kevin@example.com,MyP4ss!,64.137.10.153:5803:user:pass,FR,42;42.5;43
  kev_002,jo@example.com,MyP4ss!,http://user:pass@proxy1.com:8080,FR,42

----------------------------------------------------------------------
cards.csv
----------------------------------------------------------------------
Columns:
  account_id    must match an account_id from accounts.csv
  card_number   13-19 digits, NO spaces, NO dashes
  expiry        MM/YY   e.g. 12/27
  cvv           3 or 4 digits
  holder_name   exactly as printed on the card

Example row:
  kev_001,4111111111111111,12/27,123,Kevin Dupont

WARNING: delete this file AFTER the wizard has imported it. The data is
encrypted into a local SQLite database during import.

----------------------------------------------------------------------
addresses.csv
----------------------------------------------------------------------
Columns:
  account_id   must match accounts.csv
  firstName    recipient first name
  lastName     recipient last name
  email        recipient email
  street       street + number
  city
  zip
  country      ISO 2-letter code
  phone        optional, international format e.g. +33600000000

Example row:
  kev_001,Kevin,Dupont,kevin@example.com,10 rue de la Paix,Paris,75002,FR,+33600000000

----------------------------------------------------------------------
drop.csv
----------------------------------------------------------------------
Columns (in order):
  sku                Nike SKU / styleColor, e.g. IQ7604-101 — OR a full product URL
  name               optional — a label for the pair so you recognise it in the
                       dashboard + report (display only, never affects matching)
  sizes              sizes you want, separated by ";" (or use "," inside quotes)
                       e.g.  42;42.5;43    or    "42,42.5,43"
  accounts_filter    "all"   OR   ";"-separated account_ids   e.g. kev_001;kev_002
  country            optional ISO 2-letter code (default FR)

Example rows:
  IQ7604-101,Travis Scott AJ1 Low,42;42.5;43,all,FR
  IQ3916-100,Kobe Mambacita,"42,43",kev_001,FR
`

export type TemplateKey = 'accounts' | 'cards' | 'addresses' | 'drop'

const TEMPLATES: Record<TemplateKey, string> = {
	accounts: ACCOUNTS_TEMPLATE,
	cards: CARDS_TEMPLATE,
	addresses: ADDRESSES_TEMPLATE,
	drop: DROP_TEMPLATE,
}

export async function generateTemplates(
	folder: string,
	opts: { overwrite?: boolean } = {},
): Promise<{ created: TemplateKey[]; skipped: TemplateKey[] }> {
	await mkdir(folder, { recursive: true })
	const created: TemplateKey[] = []
	const skipped: TemplateKey[] = []
	for (const key of Object.keys(TEMPLATES) as TemplateKey[]) {
		const file = join(folder, `${key}.csv`)
		if (!opts.overwrite && (await fileExists(file))) {
			// Auto-replace files that are still the legacy comment-laden template:
			// if the first non-empty line starts with "#", the user has not begun
			// to fill it, so we can safely refresh it.
			if (await isLegacyCommentTemplate(file)) {
				await writeFile(file, TEMPLATES[key], 'utf8')
				if (key === 'accounts' || key === 'cards') await chmod(file, 0o600)
				created.push(key)
				continue
			}
			skipped.push(key)
			continue
		}
		await writeFile(file, TEMPLATES[key], 'utf8')
		if (key === 'accounts' || key === 'cards') {
			await chmod(file, 0o600)
		}
		created.push(key)
	}

	const helpFile = join(folder, '_HOW_TO_FILL.txt')
	if (opts.overwrite || !(await fileExists(helpFile))) {
		await writeFile(helpFile, INSTRUCTIONS, 'utf8')
	}

	// Seed an editable selectors.yaml from the bundled selectors.example.yaml so
	// the runtime (run / dry-run) finds it in the data folder on a fresh install.
	const selectorsFile = join(folder, 'selectors.yaml')
	if (opts.overwrite || !(await fileExists(selectorsFile))) {
		const example = bundledSelectorsExample()
		if (example) {
			try {
				await writeFile(selectorsFile, await readFile(example, 'utf8'), 'utf8')
			} catch { /* best-effort */ }
		}
	}

	return { created, skipped }
}

/** Locate the bundled selectors.example.yaml (app dir or dev source tree). */
function bundledSelectorsExample(): string | undefined {
	const candidates: string[] = []
	if (process.env.NIKE_BOT_APP_PATH) candidates.push(join(process.env.NIKE_BOT_APP_PATH, 'selectors.example.yaml'))
	try {
		const here = dirname(fileURLToPath(import.meta.url))
		candidates.push(join(here, 'selectors.example.yaml')) // bundled (main.mjs sibling)
		candidates.push(join(here, '..', '..', '..', 'selectors.example.yaml')) // dev: wizard → package root
	} catch { /* ignore */ }
	return candidates.find((p) => existsSyncSafe(p))
}

function existsSyncSafe(p: string): boolean {
	try { return existsSync(p) } catch { return false }
}

async function fileExists(p: string): Promise<boolean> {
	try {
		await access(p)
		return true
	} catch {
		return false
	}
}

async function isLegacyCommentTemplate(file: string): Promise<boolean> {
	try {
		const text = await readFile(file, 'utf8')
		const firstNonEmpty = text.split(/\r?\n/).find((l) => l.trim() !== '')
		return firstNonEmpty !== undefined && firstNonEmpty.trimStart().startsWith('#')
	} catch {
		return false
	}
}
