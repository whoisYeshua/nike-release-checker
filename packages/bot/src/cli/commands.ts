import { existsSync } from 'node:fs'
import { Command } from 'commander'
import type { CheckoutResult } from '../tui/SummaryScreen.tsx'
import { dataFile } from '../config/dataDir.ts'

/**
 * Default path for a user-editable config file. Prefers the shared data folder
 * (~/Downloads/nikebot — where the setup wizard writes the templates the user
 * fills in), falling back to the current directory for power users who keep
 * files alongside the binary. Evaluated at module load, which is fine: the data
 * folder location is stable for a given machine.
 */
function configDefault(name: string): string {
	const inDataDir = dataFile(name)
	if (existsSync(inDataDir)) return inDataDir
	if (existsSync(`./${name}`)) return `./${name}`
	// Neither exists yet → point at the data folder so error messages guide the
	// user to the canonical place to create it.
	return inDataDir
}

// Version is injected at build time via esbuild `define` (__BOT_VERSION__).
// Touching `globalThis.require` in a Node SEA throws synchronously
// (createRequire(__filename=undefined)), so we never look it up at runtime.
declare const __BOT_VERSION__: string | undefined
const pkg: { version: string } = {
	version: typeof __BOT_VERSION__ === 'string' ? __BOT_VERSION__ : '0.1.0',
}

export const program = new Command()

program
	.name('nike-bot')
	.description('Nike SNKRS auto-checkout bot')
	.version(pkg.version)
	.option('--config <path>', 'Path to bot config file', './bot.config.yaml')

program
	.command('import-accounts')
	.description('Import Nike account configurations from a JSON file')
	.requiredOption('--file <path>', 'Path to the accounts JSON file')
	.action(async (opts: { file: string }) => {
		const { importAccounts, formatImportSummary } = await import('../auth/accountManager.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		try {
			const result = await importAccounts(opts.file)

			const lines = formatImportSummary(result, result.processedAccounts)
			for (const line of lines) console.log(line)

			const nonAccountErrors = result.errors.filter((e) => e.accountId.startsWith('index:'))
			if (nonAccountErrors.length > 0) {
				console.log('\nValidation errors:')
				for (const err of nonAccountErrors) {
					console.log(`  ${err.accountId}: ${err.reason}`)
				}
			}
		} catch (err) {
			console.error(`❌ Import failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('login-all')
	.description('Authenticate all accounts (or a single one with --account)')
	.option('--account <id>', 'Authenticate a single account by ID')
	.action(async (opts: { account?: string }) => {
		const { authenticateAll, authenticateSingle } = await import('../auth/accountManager.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		try {
			if (opts.account) {
				const result = await authenticateSingle(opts.account)
				const elapsed = `${(result.durationMs / 1000).toFixed(1)}s`
				if (result.success) {
					console.log(`Authenticating ${maskCredentials(result.accountId)}... done (${elapsed})`)
				} else if (result.error?.includes('not found in imported accounts')) {
					console.error(`Error: Account '${maskCredentials(result.accountId)}' not found.`)
					process.exit(1)
				} else {
					const msg = maskCredentials(result.error ?? 'unknown error')
					console.error(`Authenticating ${maskCredentials(result.accountId)}... failed (${msg})`)
					if (result.failureReason === 'blocked') {
						console.error(`Nike blocked the automated login flow. Run: nike-bot capture-session --account ${maskCredentials(result.accountId)}`)
					}
					process.exit(1)
				}
			} else {
				const results = await authenticateAll()
				let succeeded = 0
				for (const r of results) {
					const label = maskCredentials(r.accountId)
					const elapsed = `${(r.durationMs / 1000).toFixed(1)}s`
					if (r.success) {
						succeeded++
						console.log(`  ✓ ${label} — done (${elapsed})`)
					} else {
						console.log(`  ✗ ${label} — failed (${maskCredentials(r.error ?? 'unknown error')})`)
						if (r.failureReason === 'blocked') {
							console.log(`    Nike blocked automated login. Run: nike-bot capture-session --account ${label}`)
						}
					}
				}
				const total = results.length
				console.log(`\n${succeeded}/${total} accounts authenticated. ${total - succeeded} failed.`)
			}
		} catch (err) {
			console.error(`❌ Login failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('logout-all')
	.description('Delete sessions for all accounts (or a specific one with --account)')
	.option('--account <id>', 'Account ID to log out')
	.action(async (opts: { account?: string }) => {
		const { clearAllSessions, clearSession } = await import('../auth/accountManager.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		try {
			if (opts.account) {
				await clearSession(opts.account)
				console.log(`Session cleared for ${maskCredentials(opts.account)}.`)
			} else {
				const { count } = await clearAllSessions()
				if (count === 0) {
					console.log('No sessions to clear.')
				} else {
					console.log(`All sessions cleared. ${count} session file${count === 1 ? '' : 's'} removed.`)
				}
			}
		} catch (err) {
			console.error(`❌ ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('capture-session')
	.description('Open a browser so you can log in manually, then save the full session (cookies + localStorage)')
	.requiredOption('--account <id>', 'Account ID to store the session under (e.g. "myemail@example.com")')
	.option('--headless', 'Run without visible browser (cookies from stdin pipe required)', false)
	.action(async (opts: { account: string; headless?: boolean }) => {
		const { launchRealChrome } = await import('../stealth/realChrome.ts')
		const { captureFullSession, persistSessionSnapshot, waitForNikeAuthCookie } = await import('../auth/captureSession.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')

		if (opts.headless) {
			console.error('❌ --headless mode requires piping session data — not yet supported. Run without --headless.')
			process.exit(1)
		}

		console.log('Launching real Google Chrome for manual Nike session capture...')
		console.log('')
		console.log(`  1. Chrome opens with an isolated profile for ${maskCredentials(opts.account)}`)
		console.log('  2. Navigate to https://www.nike.com/fr and log in with your account')
		console.log('  3. The bot will automatically detect when the auth cookie is set')
		console.log('  4. Do NOT close the Chrome window until capture completes')
		console.log('')

		// Bind the capture to the SAME exit IP checkout will later use, so the
		// session is consistent with the proxy. Look up the stored account's proxy.
		let captureProxy: string | undefined
		try {
			const { loadStoredAccounts } = await import('../auth/accountManager.ts')
			captureProxy = (await loadStoredAccounts()).find((a) => a.id === opts.account)?.proxy
		} catch { /* no stored proxy — capture on host IP */ }

		const { context, close } = await launchRealChrome({ headless: false, accountId: opts.account, ...(captureProxy ? { proxy: captureProxy } : {}) })

		// Use the default page that Chrome opens on startup, or create one
		const existingPages = context.pages()
		const page = existingPages[0] ?? (await context.newPage())
		await page.goto('https://www.nike.com/fr', { waitUntil: 'domcontentloaded' })

		// Poll for the sid auth cookie — Nike's OAuth flow sets it AFTER login completes.
		// This replaces manual "press ENTER" which was too easy to trigger prematurely.
		console.log('Waiting for Nike auth cookie (sid)... (2 min timeout)')
		const sidFound = await waitForNikeAuthCookie(context, 120_000, 1500)
		if (!sidFound) {
			console.error('')
			console.error('❌ Timeout: sid cookie never appeared. Did you complete login?')
			console.error('   If yes, Nike may have changed their OAuth flow. Try again.')
			await close()
			process.exit(1)
		}
		console.log('✓ sid cookie detected — waiting 5s for full OAuth callback to settle...')
		await new Promise((r) => setTimeout(r, 5000))

		console.log('Capturing session state...')
		const snapshot = await captureFullSession(context, page)
		const hasSid = snapshot.cookies.some((c) => c.name === 'sid')
		const hasOidcLocalStorage = Object.values(snapshot.localStorage).some((ls) =>
			Object.keys(ls).some((k) => k.startsWith('oidc.')),
		)

		console.log(`  Cookies captured: ${snapshot.cookies.length}`)
		console.log(`  localStorage origins: ${Object.keys(snapshot.localStorage).length}`)
		console.log(`  sessionStorage origins: ${Object.keys(snapshot.sessionStorage).length}`)
		console.log(`  sid cookie: ${hasSid ? '✓' : '✗'}`)
		console.log(`  OIDC localStorage entries: ${hasOidcLocalStorage ? '✓' : '✗'}`)

		if (!hasSid || !hasOidcLocalStorage) {
			console.log('')
			console.log('⚠️  Warning: session may be incomplete. Make sure you were actually logged in before pressing ENTER.')
		}

		try {
			await persistSessionSnapshot(opts.account, snapshot)
			console.log('')
			console.log(`✓ Session saved for '${maskCredentials(opts.account)}'`)
		} catch (err) {
			console.error(`❌ Failed to save session: ${maskCredentials(String(err))}`)
			process.exit(1)
		} finally {
			await close()
		}
	})

program
	.command('accounts')
	.description('List all accounts with their session status')
	.option('--verbose', 'Show additional details')
	.action(async (opts: { verbose?: boolean }) => {
		const { listAccounts } = await import('../auth/accountManager.ts')
		const { maskEmail, maskProxy } = await import('../logger/credentialMasker.ts')

		const rows = await listAccounts(opts.verbose ?? false)

		if (rows.length === 0) {
			console.log("No accounts found. Run 'nike-bot import-accounts' first.")
			return
		}

		const SESSION_LABEL: Record<string, string> = {
			valid: 'valid',
			expired: 'expired',
			missing: 'missing',
		}

		// Build display rows with masked values
		const displayRows = rows.map((r) => ({
			id: r.id,
			email: maskEmail(r.email),
			country: r.country,
			proxy: r.proxy ? maskProxy(r.proxy) : '(none)',
			session: SESSION_LABEL[r.session.status] ?? r.session.status,
			...(opts.verbose
				? {
						sizes: r.preferredSizes?.join(', ') ?? '',
						lastLogin: r.session.lastLogin?.toISOString().slice(0, 19).replace('T', ' ') ?? '—',
						domains: String(r.session.domainCount ?? '—'),
					}
				: {}),
		}))

		// Column headers
		const baseHeaders = ['ID', 'Email', 'Country', 'Proxy', 'Session']
		const verboseHeaders = opts.verbose ? ['Sizes', 'Last Login', 'Domains'] : []
		const headers = [...baseHeaders, ...verboseHeaders]
		const keys = opts.verbose
			? (['id', 'email', 'country', 'proxy', 'session', 'sizes', 'lastLogin', 'domains'] as const)
			: (['id', 'email', 'country', 'proxy', 'session'] as const)

		// Compute column widths
		const widths = headers.map((h, i) => {
			const key = keys[i]!
			// use reduce to avoid RangeError from spread on large account lists (P3)
			const maxVal = displayRows.reduce(
				(m, r) => Math.max(m, String((r as Record<string, string>)[key] ?? '').length),
				0,
			)
			return Math.max(h.length, maxVal)
		})

		const pad = (s: string, w: number): string => s.padEnd(w)
		const line = (cols: string[]): string => cols.map((c, i) => pad(c, widths[i]!)).join('  ')

		console.log(`\nNike Accounts — ${rows.length} account(s)\n`)
		console.log(line(headers))
		console.log(widths.map((w) => '-'.repeat(w)).join('  '))
		for (const r of displayRows) {
			console.log(line(keys.map((k) => String((r as Record<string, string>)[k] ?? ''))))
		}
		console.log()
	})

program
	.command('start')
	.description('Start monitoring and automatic checkout')
	.requiredOption('--slug <slug>', 'Nike product slug to monitor')
	.requiredOption('--sizes <sizes>', 'Target sizes comma-separated (e.g. 42,42.5,43)')
	.requiredOption('--url <url>', 'Product URL for checkout')
	.option('--daemon', 'Run as background daemon', false)
	.option('--dry-run', 'Simulate checkout without placing real orders', false)
	.option('--no-auto-checkout', 'Disable automatic checkout trigger')
	.action(async (opts: { slug: string; sizes: string; url: string; daemon?: boolean; dryRun?: boolean; autoCheckout?: boolean }) => {
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		const { loadBotConfig } = await import('../config/botConfig.ts')
		const { startMonitorAndCheckout } = await import('../monitor/autoCheckout.ts')
		const configPath = program.opts<{ config: string }>().config

		try {
			const config = await loadBotConfig(configPath)

			if (opts.daemon) {
				const { daemonize } = await import('../daemon/daemonize.ts')
				daemonize(process.argv.slice(2).filter((a) => a !== '--daemon'))
				// daemonize never returns
			}

			const controller = new AbortController()

			// Write PID file for the foreground process
			const { writePidFile } = await import('../daemon/daemonize.ts')
			const { setupGracefulShutdown } = await import('../daemon/gracefulShutdown.ts')
			writePidFile()
			setupGracefulShutdown(controller)

			const targetSizes = opts.sizes.split(',').map((s) => s.trim()).filter(Boolean)

			await startMonitorAndCheckout(
				{
					slug: opts.slug,
					productUrl: opts.url,
					targetSizes,
					dryRun: opts.dryRun ?? false,
					configPath,
					autoCheckout: opts.autoCheckout !== false,
				},
				config,
				controller,
			)
		} catch (err) {
			console.error(`❌ Start failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('drop')
	.description('Wait for a SKU to appear on Nike FR, then immediately checkout (or dry-run)')
	.requiredOption('--sku <sku>', 'Nike SKU / styleColor code (e.g. IQ7604-101)')
	.requiredOption('--profile <account_id>', 'Account ID to use for checkout')
	.option('--sizes <sizes>', 'Target EU sizes comma-separated (e.g. 40,40.5,41)')
	.option('--selectors <path>', 'Path to selectors YAML file', configDefault('selectors.yaml'))
	.option('--dry-run', 'Simulate checkout without placing real order', false)
	.option('--poll-interval <ms>', 'Feed poll interval in ms (default: 3000)', '3000')
	.option('--timeout <ms>', 'Max time to wait for SKU to appear in ms (default: 3600000 = 1h)', '3600000')
	.action(async (opts: { sku: string; profile: string; sizes?: string; selectors?: string; dryRun?: boolean; pollInterval: string; timeout: string }) => {
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		const { loadStoredAccounts } = await import('../auth/accountManager.ts')
		const { loadBotConfig } = await import('../config/botConfig.ts')
		const { loadSelectors } = await import('../config/selectors.ts')
		const { resolveSkuToSlug } = await import('../monitor/poller.ts')
		const { runCheckoutPipeline } = await import('../checkout/checkoutPipeline.ts')
		const configPath = program.opts<{ config: string }>().config

		try {
			const accounts = await loadStoredAccounts()
			const account = accounts.find((a) => a.id === opts.profile)
			if (!account) {
				console.error(`Error: Account '${opts.profile}' not found.`)
				process.exit(1)
			}
			const config = await loadBotConfig(configPath)
			const selectors = await loadSelectors(opts.selectors)
			const targetSizes = opts.sizes ? opts.sizes.split(',').map((s) => s.trim()) : account.preferredSizes ?? []
			const pollIntervalMs = parseInt(opts.pollInterval, 10)
			const timeoutMs = parseInt(opts.timeout, 10)

			console.log(`[drop] Waiting for SKU ${opts.sku} to appear on Nike FR...`)
			console.log(`[drop] Poll interval: ${pollIntervalMs}ms — Timeout: ${timeoutMs / 1000}s`)
			console.log(`[drop] Target sizes: ${targetSizes.join(', ')}`)
			if (opts.dryRun) console.log(`[drop] DRY-RUN mode — no real order will be placed`)

			const controller = new AbortController()
			const timeoutTimer = setTimeout(() => {
				controller.abort()
				console.error(`[drop] Timeout: SKU ${opts.sku} never appeared after ${timeoutMs / 1000}s`)
				process.exit(1)
			}, timeoutMs)

			const resolved = await resolveSkuToSlug(opts.sku, config, controller.signal, pollIntervalMs)
			clearTimeout(timeoutTimer)

			console.log(`[drop] ✓ SKU found! slug: ${resolved.slug}`)
			console.log(`[drop] URL: ${resolved.productUrl}`)
			console.log(`[drop] Launching checkout immediately...`)

			const result = await runCheckoutPipeline(account, config, selectors, {
				productUrl: resolved.productUrl,
				targetSizes,
				dryRun: opts.dryRun ?? false,
			})

			console.log(`[drop] Result: ${result.finalOutcome} (${result.durationMs}ms)`)
			for (const step of result.steps) {
				const status = step.outcome === 'success' ? '✓' : '✗'
				const detail = step.details ? ` — ${step.details}` : step.error ? ` — ${maskCredentials(step.error)}` : ''
				console.log(`  ${status} ${step.step}: ${step.outcome}${detail}`)
			}
			if (result.finalOutcome !== 'success' && result.finalOutcome !== '3ds_success' && result.finalOutcome !== 'no_session') {
				process.exit(1)
			}
		} catch (err) {
			console.error(`❌ Drop failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('dry-run')
	.description('Test the full checkout flow without placing an order')
	.requiredOption('--slug <slug>', 'Nike product slug')
	.requiredOption('--profile <account_id>', 'Account ID to use for the dry run')
	.option('--sizes <sizes>', 'Target sizes comma-separated (e.g. 42,42.5,43)')
	.option('--selectors <path>', 'Path to selectors YAML file', configDefault('selectors.yaml'))
	.option('--url <url>', 'Full product URL (overrides slug-based URL)')
	.option('--addresses-csv <path>', 'Path to addresses.csv', configDefault('addresses.csv'))
	.option('--unlock-cards', 'Decrypt the card from cards.db (prompts for passphrase)', false)
	.action(async (opts: { slug: string; profile: string; sizes?: string; selectors?: string; url?: string; addressesCsv: string; unlockCards?: boolean }) => {
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		const { loadStoredAccounts } = await import('../auth/accountManager.ts')
		const { loadBotConfig } = await import('../config/botConfig.ts')
		const { loadSelectors } = await import('../config/selectors.ts')
		const { runCheckoutPipeline } = await import('../checkout/checkoutPipeline.ts')
		const { parseAddressesCsv } = await import('../config/addressesCsv.ts')
		const { existsSync } = await import('node:fs')
		const configPath = program.opts<{ config: string }>().config
		try {
			const accounts = await loadStoredAccounts()
			const account = accounts.find((a) => a.id === opts.profile)
			if (!account) {
				console.error(`Error: Account '${opts.profile}' not found.`)
				process.exit(1)
			}
			const config = await loadBotConfig(configPath)
			const selectors = await loadSelectors(opts.selectors)
			const targetSizes = opts.sizes ? opts.sizes.split(',').map((s) => s.trim()) : account.preferredSizes ?? []
			const productUrl = opts.url ?? `https://www.nike.com/fr/launch/t/${opts.slug}`

			// Derive slug + styleColor for the API (hybrid) pipeline. Nike PDP URLs
			// are `/fr/t/<slug>/<styleColor>` (styleColor like "IO1560-900"). The
			// hybrid pipeline uses styleColor as the Product Feed key when the
			// __NEXT_DATA__ hydration SKU lookup misses, so without it the SKU
			// resolver returns HTTP 400. Fall back to the --slug flag otherwise.
			let resolvedSlug = opts.slug
			let resolvedStyleColor = ''
			{
				const m = /\/t\/([^/]+)\/([A-Z0-9]+-[0-9]+)/i.exec(productUrl)
				if (m) {
					resolvedSlug = m[1] ?? opts.slug
					resolvedStyleColor = m[2] ?? ''
				}
			}

			// 1. Load shipping address from addresses.csv (if file exists).
			let shippingAddress: { street: string; city: string; zip: string; country: string; phone?: string; email?: string; firstName?: string; lastName?: string } | undefined
			if (existsSync(opts.addressesCsv)) {
				const knownIds = new Set([account.id])
				const accCountries = new Map([[account.id, account.country]])
				const parsed = await parseAddressesCsv(opts.addressesCsv, knownIds, accCountries)
				if (parsed.errors.length > 0) {
					console.error(`❌ addresses.csv has ${parsed.errors.length} error(s):`)
					for (const e of parsed.errors) console.error(`  row ${e.row} [${e.column}]: ${e.message}`)
					process.exit(1)
				}
				const addr = parsed.byAccountId.get(account.id)
				if (addr) {
					shippingAddress = {
						street: addr.street,
						city: addr.city,
						zip: addr.zip,
						country: addr.country,
						phone: addr.phone,
						email: account.email,
						// firstName/lastName derived later if --unlock-cards (split holder).
					}
					console.log(`[DRY-RUN] Loaded shipping address for ${account.id} from ${opts.addressesCsv}`)
				} else {
					console.log(`[DRY-RUN] No address row for ${account.id} in ${opts.addressesCsv} — will rely on Nike profile fallback`)
				}
			}

			// 2. Optionally unlock the cards DB and pull this account's card.
			let card: { number: string; expiry: string; cvv: string; holderName: string } | undefined
			if (opts.unlockCards) {
				const { promptPassphrase } = await import('./prompts.ts')
				const { initWithPassphrase, getCard } = await import('../config/cardsStore.ts')
				const passphrase = await promptPassphrase('Cards DB passphrase: ')
				const { key } = await initWithPassphrase(passphrase)
				const row = getCard(account.id, key)
				if (!row) {
					console.error(`❌ No card stored for account '${account.id}'. Run 'nike-bot cards import' first.`)
					process.exit(1)
				}
				card = {
					number: row.card_number,
					expiry: row.expiry,
					cvv: row.cvv,
					holderName: row.holder_name,
				}
				// Derive firstName/lastName from card holder for the shipping form.
				if (shippingAddress && row.holder_name) {
					const parts = row.holder_name.trim().split(/\s+/)
					shippingAddress.firstName = parts[0]
					shippingAddress.lastName = parts.slice(1).join(' ') || parts[0]
				}
				console.log(`[DRY-RUN] Unlocked card for ${account.id} (holder: ${maskCredentials(row.holder_name)})`)
			}

			console.log(`[DRY-RUN] Starting dry-run for ${opts.url ? `URL: ${opts.url}` : `slug: ${opts.slug}`}`)
			const result = await runCheckoutPipeline(account, config, selectors, {
				productUrl,
				targetSizes,
				slug: resolvedSlug,
				styleColor: resolvedStyleColor,
				country: account.country,
				dryRun: true,
				shippingAddress,
				card,
			})
			console.log(`[DRY-RUN] Result: ${result.finalOutcome} (${result.durationMs}ms)`)
			for (const step of result.steps) {
				const status = step.outcome === 'success' ? '✓' : '✗'
				const detail = step.details ? ` — ${step.details}` : step.error ? ` — ${maskCredentials(step.error)}` : ''
				console.log(`  ${status} ${step.step}: ${step.outcome}${detail}`)
			}
			if (result.finalOutcome !== 'success' && result.finalOutcome !== '3ds_success' && result.finalOutcome !== 'no_session') {
				process.exit(1)
			}
		} catch (err) {
			console.error(`❌ Dry-run failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('checkout')
	.description('Run the checkout pipeline for all accounts (or a single one)')
	.requiredOption('--slug <slug>', 'Nike product slug to checkout')
	.option('--sizes <sizes>', 'Target sizes comma-separated (e.g. 42,42.5,43)')
	.option('--account <id>', 'Run checkout for a single account by ID')
	.option('--dry-run', 'Simulate checkout without placing real orders', false)
	.option('--selectors <path>', 'Path to selectors YAML file', configDefault('selectors.yaml'))
	.action(async (opts: { slug: string; sizes?: string; account?: string; dryRun?: boolean; selectors?: string }) => {
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		const { runParallelCheckout } = await import('../checkout/parallelCheckout.ts')
		const { loadStoredAccounts } = await import('../auth/accountManager.ts')
		const configPath = program.opts<{ config: string }>().config
		try {
			const productUrl = `https://www.nike.com/fr/launch/t/${opts.slug}`
			const targetSizes = opts.sizes ? opts.sizes.split(',').map((s) => s.trim()) : undefined
			const dryRun = opts.dryRun ?? false

			let accounts
			if (opts.account) {
				const all = await loadStoredAccounts()
				const found = all.find((a) => a.id === opts.account)
				if (!found) {
					console.error(`Error: Account '${opts.account}' not found.`)
					process.exit(1)
				}
				accounts = [found]
			}

			const summary = await runParallelCheckout({
				productUrl,
				targetSizes,
				dryRun,
				configPath,
				selectorsPath: opts.selectors,
				accounts,
			})

			if (summary.complete === 0 && summary.total > 0) {
				process.exit(1)
			}
		} catch (err) {
			console.error(`❌ Checkout failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('stop')
	.description('Stop the running daemon')
	.action(async () => {
		const { isDaemonRunning, removePidFile } = await import('../daemon/daemonize.ts')
		const { running, pid } = isDaemonRunning()
		if (!running) {
			console.log('No daemon is currently running.')
			return
		}
		process.kill(pid!, 'SIGTERM')
		removePidFile()
		console.log(`Daemon stopped (PID: ${pid})`)
	})

// Module-scoped cards key — held in memory only, never persisted.
// Populated by `cards unlock` for future drop-time retrieval; v1 is a placeholder.
let cardsKey: Buffer | null = null

const cards = program.command('cards').description('Manage encrypted payment cards')

cards
	.command('import')
	.description('Import cards from a CSV file into the encrypted SQLite store')
	.requiredOption('--file <path>', 'Path to the cards.csv file')
	.action(async (opts: { file: string }) => {
		const { promptPassphrase } = await import('./prompts.ts')
		const { initWithPassphrase, importCardsCsv } = await import('../config/cardsStore.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		try {
			const passphrase = await promptPassphrase('Passphrase: ')
			const { key } = await initWithPassphrase(passphrase)
			const result = await importCardsCsv(opts.file, key)
			if (result.errors.length > 0) {
				console.error(`❌ Import aborted — ${result.errors.length} validation error(s):`)
				for (const err of result.errors) {
					const suffix = err.suggestion ? ` (${err.suggestion})` : ''
					console.error(`  row ${err.row} [${err.column}]: ${err.message}${suffix}`)
				}
				process.exit(1)
			}
			console.log(`✓ Imported ${result.imported} card(s). Source renamed to *.imported.`)
		} catch (err) {
			console.error(`❌ Cards import failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

cards
	.command('reset')
	.description('Move the encrypted cards DB aside (backup) so a new passphrase can be set')
	.action(async () => {
		const { promptLine } = await import('./prompts.ts')
		const { resetDb } = await import('../config/cardsStore.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		try {
			const answer = await promptLine('This will move the cards DB aside. Type "yes" to confirm: ')
			if (answer.trim().toLowerCase() !== 'yes') {
				console.log('Aborted.')
				return
			}
			const backup = resetDb()
			if (backup) console.log(`✓ DB moved to ${backup}`)
			else console.log('No existing DB to reset.')
		} catch (err) {
			console.error(`❌ Cards reset failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

cards
	.command('unlock')
	.description('Unlock the encrypted cards DB for the current session (validates passphrase)')
	.action(async () => {
		const { promptPassphrase } = await import('./prompts.ts')
		const { initWithPassphrase } = await import('../config/cardsStore.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		try {
			const passphrase = await promptPassphrase('Passphrase: ')
			const { key } = await initWithPassphrase(passphrase)
			cardsKey = key
			console.log('✓ Cards DB unlocked for this session.')
		} catch (err) {
			console.error(`❌ Unlock failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

// Exposed for future drop-time access; not wired up in v1.
export function getSessionCardsKey(): Buffer | null {
	return cardsKey
}

program
	.command('kpsdk-stats')
	.description('Print KPSDK token cache statistics (hits, misses, evictions, size). Run during a drop to verify warm-up efficiency.')
	.option('--json', 'Output as JSON', false)
	.action(async (opts: { json?: boolean }) => {
		const { kpsdkCacheHolder } = await import('../stealth/kpsdk/cache.ts')
		const stats = kpsdkCacheHolder.instance.stats()
		if (opts.json) {
			console.log(JSON.stringify(stats))
		} else {
			const hitRate = (stats.hits + stats.misses) > 0
				? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
				: '—'
			console.log('\nKPSDK Token Cache Statistics\n')
			console.log(`  Size       : ${stats.size}`)
			console.log(`  Hits       : ${stats.hits}`)
			console.log(`  Misses     : ${stats.misses}`)
			console.log(`  Evictions  : ${stats.evictions}`)
			console.log(`  Hit rate   : ${hitRate}%`)
			console.log()
		}
	})

program
	.command('install-browser')
	.description('Download and install Playwright Chromium (usually auto-run on first launch)')
	.option('--proxy <url>', 'HTTP/HTTPS proxy for download (e.g. http://corp:8080)')
	.action(async (opts: { proxy?: string }) => {
		const { installChromium } = await import('../installer/chromiumInstaller.ts')
		console.log('Installing Chromium...')
		try {
			await installChromium({
				proxy: opts.proxy,
				onProgress: (e) => process.stdout.write(`\r${e.phase}: ${e.percent}%   `),
			})
			console.log('\n✓ Chromium installed.')
		} catch (err) {
			console.error('\n✗ Failed:', (err as Error).message)
			process.exit(1)
		}
	})

program
	.command('init')
	.description('Interactive setup wizard — configure accounts, cards, addresses, capture sessions, dry-run')
	.action(async () => {
		try {
			const { runInitWizard } = await import('./wizard/initWizard.tsx')
			await runInitWizard()
		} catch (err) {
			const msg = (err as Error).message ?? ''
			if (/No such built-in module: ink|Cannot find (module|package) 'ink/.test(msg)) {
				console.error(
					'The `init` wizard requires the `ink` TUI runtime, which is not bundled into the standalone binary.',
				)
				console.error('Run it from a Node.js install instead:')
				console.error('  npx --package=@nike-release-checker/bot nike-bot init')
				process.exit(2)
			}
			throw err
		}
	})

program
	.command('status')
	.description('Show daemon status and account session health')
	.option('--json', 'Output status as structured JSON', false)
	.action(async (opts: { json?: boolean }) => {
		const { getBotStatus, printBotStatus } = await import('../daemon/botStatus.ts')
		const { maskCredentials } = await import('../logger/credentialMasker.ts')
		try {
			const status = await getBotStatus()
			if (opts.json) {
				const validCount = status.accounts.filter((a) => a.valid).length
				const expiredCount = status.accounts.filter((a) => a.reason === 'expired').length
				const missingCount = status.accounts.filter((a) => a.reason === 'no_session').length
				console.log(JSON.stringify({
					bot: {
						running: status.running,
						pid: status.pid ?? null,
						uptimeMs: status.uptimeMs ?? null,
					},
					sessions: {
						valid: validCount,
						expired: expiredCount,
						missing: missingCount,
						total: status.accounts.length,
					},
				}))
			} else {
				printBotStatus(status)
			}
		} catch (err) {
			console.error(`❌ Status failed: ${maskCredentials(String(err))}`)
			process.exit(1)
		}
	})

program
	.command('run')
	.description('Execute drops from drop.csv with live TUI dashboard')
	.option('--drops <path>', 'Path to drop.csv', configDefault('drop.csv'))
	.option('--accounts-csv <path>', 'Path to accounts.csv', configDefault('accounts.csv'))
	.option('--selectors <path>', 'Path to selectors YAML', configDefault('selectors.yaml'))
	.option('--dry-run', 'Run pipeline without submitting orders', false)
	.option('--wait-live <seconds>', 'Keep re-attempting a not-yet-live drop until it goes live (drop-day arming). 0 = single pass.', '0')
		.option('--addresses-csv <path>', 'Path to addresses.csv', configDefault('addresses.csv'))
		.option('--no-unlock-cards', 'Skip unlocking cards.db (size/cart/shipping only, no real payment)')
	.action(
		async (opts: {
			drops: string
			accountsCsv: string
			selectors: string
			dryRun?: boolean
			waitLive?: string
			addressesCsv: string
			unlockCards?: boolean
		}) => {
			const { maskCredentials } = await import('../logger/credentialMasker.ts')
			const { parseAccountsCsv } = await import('../config/accountsCsv.ts')
			const { parseDropCsv, resolveAccountsFilter } = await import(
				'../config/dropCsv.ts'
			)
			const { loadStoredAccounts } = await import('../auth/accountManager.ts')
			const { loadBotConfig } = await import('../config/botConfig.ts')
			const { resolveSkuToSlug } = await import('../monitor/poller.ts')
			const { runParallelCheckout } = await import(
				'../checkout/parallelCheckout.ts'
			)
			const { toCheckoutResult } = await import(
				'../checkout/checkoutResultAdapter.ts'
			)
			const { default: React } = await import('react')
			const { render } = await import('ink')
			const { Dashboard } = await import('../tui/Dashboard.tsx')
			const { renderSummary } = await import('../tui/renderSummary.tsx')
				const { renderRetrySelection } = await import('../tui/renderRetrySelection.tsx')
				const { RetryController } = await import('../checkout/retryController.ts')

			const configPath = program.opts<{ config: string }>().config
			const dryRun = opts.dryRun ?? false

			try {
				// 1. Parse accounts.csv → accounts (CSV row form)
				const accountsParse = await parseAccountsCsv(opts.accountsCsv)
				if (accountsParse.errors.length > 0) {
					console.error(
						`❌ accounts.csv has ${accountsParse.errors.length} error(s):`,
					)
					for (const e of accountsParse.errors) {
						console.error(
							`  row ${e.row} [${e.column}]: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`,
						)
					}
					process.exit(1)
				}
				const csvAccountIds = new Set(
					accountsParse.accounts.map((a) => a.account_id),
				)

				// 2. Parse drop.csv against the known account-id set
				const dropParse = await parseDropCsv(opts.drops, csvAccountIds)
				if (dropParse.errors.length > 0) {
					console.error(`❌ drop.csv has ${dropParse.errors.length} error(s):`)
					for (const e of dropParse.errors) {
						console.error(`  row ${e.row} [${e.column}]: ${e.message}`)
					}
					process.exit(1)
				}
				for (const w of dropParse.warnings) {
					console.warn(`⚠️  drop.csv row ${w.row} [${w.column}]: ${w.message}`)
				}

				// No active drops → tell the user how to add one instead of exiting silently.
				if (dropParse.drops.length === 0) {
					console.log('')
					console.log(`No active drops in ${opts.drops}.`)
					console.log('Add a line (without #) in format: sku,sizes,accounts_filter')
					console.log('Example: IQ7604-101,"40;41",all')
					console.log('Then restart.')
					return
				}

				// 3. Stored accounts (already imported via `nike-bot import-accounts`)
				const stored = await loadStoredAccounts()
				const storedById = new Map(stored.map((a) => [a.id, a]))
				const allIds = stored.map((a) => a.id)
				// Pragmatic v1: trust stored accounts as having sessions. Per-account
				// session validation can be wired in once warmup mode is integrated.
				const validSessionIds = new Set(allIds)

				const config = await loadBotConfig(configPath)

				// 3.5 Load per-account shipping addresses + payment cards so the pipeline
				// can actually PAY (and so dry-run can TEST payment). Addresses need no
				// secret; cards.db is encrypted → prompt the passphrase ONCE here, before
				// the dashboard takes over the terminal.
				const { existsSync } = await import('node:fs')
				const addressByAccount = new Map<string, { street: string; city: string; zip: string; country: string; phone?: string; email?: string; firstName?: string; lastName?: string }>()
				const cardByAccount = new Map<string, { number: string; expiry: string; cvv: string; holderName: string }>()
				if (existsSync(opts.addressesCsv)) {
					const { parseAddressesCsv } = await import('../config/addressesCsv.ts')
					const knownIds = new Set(stored.map((a) => a.id))
					const accCountries = new Map(stored.map((a) => [a.id, a.country]))
					const parsed = await parseAddressesCsv(opts.addressesCsv, knownIds, accCountries)
					if (parsed.errors.length > 0) {
						console.error(`❌ addresses.csv: ${parsed.errors.length} error(s)`)
						for (const e of parsed.errors) console.error(`  row ${e.row} [${e.column}]: ${e.message}`)
						process.exit(1)
					}
					for (const a of stored) {
						const addr = parsed.byAccountId.get(a.id)
						if (addr) addressByAccount.set(a.id, { street: addr.street, city: addr.city, zip: addr.zip, country: addr.country, phone: addr.phone, email: a.email })
					}
					console.log(`[run] ${addressByAccount.size} address(es) loaded from ${opts.addressesCsv}`)
				}
				// Cards: read DIRECTLY from cards.csv (plaintext) — NO passphrase. This is the
				// file the operator fills. The encrypted cards.db is a legacy fallback, used
				// only when no cards.csv exists AND --unlock-cards is passed.
				{
					const cardsCsvPath = configDefault('cards.csv')
					if (existsSync(cardsCsvPath)) {
						try {
							const raw = (await import('node:fs')).readFileSync(cardsCsvPath, 'utf8')
							const rows = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
							if (rows.length > 1) {
								const header = rows[0]!.split(',').map((h) => h.trim())
								const col = (k: string) => header.indexOf(k)
								for (let i = 1; i < rows.length; i++) {
									const cells = rows[i]!.split(',')
									const get = (k: string) => (cells[col(k)] ?? '').trim()
									const id = get('account_id'); const number = get('card_number')
									if (!id || !number) continue
									const holder = get('holder_name')
									cardByAccount.set(id, { number, expiry: get('expiry'), cvv: get('cvv'), holderName: holder })
									const existing = addressByAccount.get(id)
									if (existing && holder && !existing.firstName) {
										const parts = holder.split(/\s+/); existing.firstName = parts[0]; existing.lastName = parts.slice(1).join(' ') || parts[0]
									}
								}
							}
							console.log(`[run] ${cardByAccount.size} card(s) loaded from ${cardsCsvPath}`)
						} catch (e) {
							console.error(`⚠️  Failed to read cards.csv: ${maskCredentials(String(e))}`)
						}
					} else if (opts.unlockCards !== false) {
						const { dbPath } = await import('../config/cardsStore.ts')
						if (existsSync(dbPath())) {
							const { promptPassphrase } = await import('./prompts.ts')
							const { initWithPassphrase, getCard } = await import('../config/cardsStore.ts')
							const passphrase = await promptPassphrase('Passphrase cards.db (Enter = no card): ')
							if (passphrase.trim().length > 0) {
								try {
									const { key } = await initWithPassphrase(passphrase)
									for (const a of stored) { const row = getCard(a.id, key); if (row) cardByAccount.set(a.id, { number: row.card_number, expiry: row.expiry, cvv: row.cvv, holderName: row.holder_name }) }
									console.log(`[run] ${cardByAccount.size} card(s) unlocked`)
								} catch (e) { console.error(`❌ Failed to unlock cards.db: ${maskCredentials(String(e))}`); process.exit(1) }
							}
						}
					}
				}

				// 3.9 ARMED + MULTIPLE pairs -> arm them ALL in parallel (user request:
				// "en armer plusieurs en parallele, les preparer"). Each round, every
				// not-yet-done pair is resolved + checked out CONCURRENTLY (Promise.all),
				// so the bot no longer blocks on pair #1 waiting for it to go live. A pair
				// leaves the rotation on COP or a hard stop; the rest keep cycling until the
				// deadline. No live TUI here (N dashboards would fight over the terminal) -
				// concise logs + a per-pair summary at the end. Single-pair and dry-run keep
				// the interactive Dashboard below.
				const waitLiveSecTop = Number.parseInt(opts.waitLive ?? '0', 10)
				const armedMulti = !dryRun && waitLiveSecTop > 0 && !Number.isNaN(waitLiveSecTop) && dropParse.drops.length > 1
				if (armedMulti) {
					const deadline = Date.now() + waitLiveSecTop * 1000
					const startedAt = new Date()
					type Armed = { drop: (typeof dropParse.drops)[number]; accounts: typeof stored; label: string; rc: InstanceType<typeof RetryController>; done: boolean; results: CheckoutResult[] }
					const armed: Armed[] = []
					for (const drop of dropParse.drops) {
						const ids = resolveAccountsFilter(drop.accountsFilter, allIds, validSessionIds)
						if (ids.length === 0) { console.log(`[run] ${drop.sku} skipped — no accounts after filter.`); continue }
						const accs = ids.map((i) => storedById.get(i)).filter((a): a is NonNullable<typeof a> => a !== undefined)
						armed.push({ drop, accounts: accs, label: drop.name ? `${drop.name} (${drop.sku})` : drop.sku, rc: new RetryController(), done: false, results: [] })
					}
					if (armed.length === 0) { console.log('No actionable drops found.'); return }
					console.log(`[run] Arming ${armed.length} pairs IN PARALLEL (up to ${waitLiveSecTop}s). Each round = one concurrent attempt per pair.`)
					const RETRYABLE = new Set(['SOLD_OUT', 'ERROR', 'THREEDS_TIMEOUT'])
					const resolveUrl = async (drop: (typeof dropParse.drops)[number]): Promise<{ productUrl: string; slug: string; styleColor: string } | null> => {
						if (/^https?:\/\//i.test(drop.sku)) {
							const sc = /\/([A-Z0-9]{2,8}-[0-9]{2,4})(?:[/?#]|$)/i.exec(drop.sku)?.[1] ?? ''
							return { productUrl: drop.sku, slug: '', styleColor: sc }
						}
						const c = new AbortController()
						const t = setTimeout(() => c.abort(), 8000)
						try { return await resolveSkuToSlug(drop.sku, config, c.signal, 3000) }
						catch { return null }
						finally { clearTimeout(t) }
					}
					let round = 0
					while (Date.now() < deadline) {
						const pending = armed.filter((a) => !a.done)
						if (pending.length === 0) break
						round++
						const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
						console.log(`[run] -- round ${round}: ${pending.length} active pair(s), ${remaining}s remaining --`)
						await Promise.all(pending.map(async (a) => {
							const resolved = await resolveUrl(a.drop)
							if (!resolved) { console.log(`[run] ${a.label} — not yet in Nike feed`); return }
							try {
								const sum = await runParallelCheckout({
									productUrl: resolved.productUrl,
									targetSizes: a.drop.sizes,
									dryRun: false,
									configPath,
									selectorsPath: opts.selectors,
									accounts: a.accounts,
									retryController: a.rc,
									cards: cardByAccount,
									addresses: addressByAccount,
								})
								const res = sum.results.map((pp) => toCheckoutResult(pp, a.drop.sku, a.drop.name))
								a.results.push(...res)
								if (res.some((r) => r.status === 'COP')) { a.done = true; console.log(`[run] COP! ${a.label}`) }
								else if (!(res.length > 0 && res.every((r) => RETRYABLE.has(r.status)))) { a.done = true; console.log(`[run] ${a.label} — stopped (${res.map((r) => r.status).join(', ')})`) }
							} catch (e) { console.error(`[run] ${a.label} — error: ${maskCredentials(String(e))}`) }
						}))
						if (armed.every((a) => a.done)) break
						await new Promise((r) => setTimeout(r, 5000))
					}
					for (const a of armed) {
						console.log(`[run] Summary ${a.label}:`)
						await renderSummary(a.results, startedAt, { retryController: a.rc, retryHandler: async () => {} }).catch(() => undefined)
					}
					return
				}
				
				
				// 4. For each drop row → run pipeline + render Dashboard live
				for (const drop of dropParse.drops) {
					const accountIds = resolveAccountsFilter(
						drop.accountsFilter,
						allIds,
						validSessionIds,
					)
					if (accountIds.length === 0) {
						console.log(
							`[run] Skipping ${drop.sku} — no accounts after filter / session check.`,
						)
						continue
					}
					const accounts = accountIds
						.map((id) => storedById.get(id))
						.filter((a): a is NonNullable<typeof a> => a !== undefined)

					const dropLabel = drop.name ? `${drop.name} (${drop.sku})` : drop.sku
					console.log(
						`[run] ${dropLabel} — resolving SKU → slug (${accounts.length} account(s))`,
					)
					let skuResolved: Awaited<ReturnType<typeof resolveSkuToSlug>>
					if (/^https?:\/\//i.test(drop.sku)) {
						// The drop row gave a full product URL — use it directly, no feed
						// resolution needed. styleColor is parsed from the trailing path
						// segment when present (…/<slug>/<STYLECOLOR>).
						const sc = /\/([A-Z0-9]{2,8}-[0-9]{2,4})(?:[/?#]|$)/i.exec(drop.sku)?.[1] ?? ''
						skuResolved = { productUrl: drop.sku, slug: '', styleColor: sc }
						console.log(`[run] ${dropLabel} → ${drop.sku} (direct URL)`)
					} else {
						const controller = new AbortController()
						// In dry-run (testing), don't block the queue forever on a SKU that
						// isn't live yet — cap the wait so a non-live SKU is skipped and the
						// next drop is tried. Real runs wait the full duration (that's the
						// point of arming the bot before a drop).
						const waitLiveResolveSec = Number.parseInt(opts.waitLive ?? '0', 10)
						const resolveCapMs = waitLiveResolveSec > 0 ? waitLiveResolveSec * 1000 : (opts.dryRun ? 20_000 : 0)
						let resolveTimer: ReturnType<typeof setTimeout> | undefined
						if (resolveCapMs > 0) {
							resolveTimer = setTimeout(() => controller.abort(), resolveCapMs)
						}
						try {
							skuResolved = await resolveSkuToSlug(drop.sku, config, controller.signal, 3000)
						} catch (err) {
							if (resolveTimer) clearTimeout(resolveTimer)
							if (controller.signal.aborted) {
								console.log(
									`[run] ${dropLabel} — not yet in Nike feed (dry-run: skipped). Use an in-stock SKU or paste the full product URL.`,
								)
								continue
							}
							throw err
						}
						if (resolveTimer) clearTimeout(resolveTimer)
						console.log(`[run] ${dropLabel} → ${skuResolved.productUrl}`)
					}

					const startedAt = new Date()
					const retryController = new RetryController()

					// Helper: run parallelCheckout and return flat CheckoutResult[].
					const runCheckout = async (
						runAccounts: typeof accounts,
					): Promise<CheckoutResult[]> => {
						const dashApp = render(
							React.createElement(Dashboard, {
								sku: drop.sku,
								sizes: drop.sizes,
								accountIds: runAccounts.map((a) => a.id),
								...(drop.name ? { name: drop.name } : {}),
								onFinished: () => { /* noop */ },
							}),
						)

						let sum
						try {
							sum = await runParallelCheckout({
								productUrl: skuResolved.productUrl,
								targetSizes: drop.sizes,
								dryRun,
								configPath,
								selectorsPath: opts.selectors,
								accounts: runAccounts,
								retryController,
								cards: cardByAccount,
								addresses: addressByAccount,
							})
						} finally {
							dashApp.unmount()
							await dashApp.waitUntilExit().catch(() => undefined)
						}

						return sum.results.map((p) => toCheckoutResult(p, drop.sku, drop.name))
					}

					// 5. Initial run.
					let results = await runCheckout(accounts)

					// Accumulate all results across original + retry rounds.
					const allResults: CheckoutResult[] = [...results]

					// 5b. Drop-day auto re-poll: when armed before a launch, the SKU is
					// in the feed but the PDP still shows "Prévenir" (not live), so the
					// first pass returns SOLD_OUT. With --wait-live > 0, keep re-running
					// (reloading the PDP) until a COP, a non-recoverable failure, or the
					// deadline. This is what lets the bot catch the exact drop second.
					const waitLiveSec = Number.parseInt(opts.waitLive ?? '0', 10)
					if (waitLiveSec > 0 && !Number.isNaN(waitLiveSec)) {
						const deadline = Date.now() + waitLiveSec * 1000
						// "Not live yet / transient" statuses worth re-attempting. We do
						// NOT loop on COP (done) or on hard stops like NO_SESSION/BLOCKED.
						const RETRYABLE = new Set(['SOLD_OUT', 'ERROR', 'THREEDS_TIMEOUT'])
						const pollMs = 5000
						let round = 0
						while (Date.now() < deadline) {
							if (results.some((r) => r.status === 'COP')) break
							const allRetryable = results.length > 0 && results.every((r) => RETRYABLE.has(r.status))
							if (!allRetryable) break // e.g. NO_SESSION/BLOCKED → stop, surface to user
							round++
							const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
							console.log(`[run] ${drop.sku} — not live yet, retrying (round ${round}, ${remaining}s remaining)…`)
							await new Promise((r) => setTimeout(r, pollMs))
							results = await runCheckout(accounts)
							allResults.push(...results)
						}
					}

					// Retry loop: summary → [R] → retry selection → dashboard → summary → ...
					// `savedReportFile` tracks the CSV created on the first summary render
					// so subsequent renders append to it rather than creating new files.
					let savedReportFile: string | undefined

					const retryHandler = async (failed: CheckoutResult[]): Promise<void> => {
						const selected = await renderRetrySelection(failed, retryController)
						if (selected.length === 0) return

						const eligible = retryController.filterRetriable(selected)
						const skipped = selected.length - eligible.length
						if (skipped > 0) {
							process.stderr.write(`[run] ${skipped} account(s) at max retries — skipped\n`)
						}
						if (eligible.length === 0) return

						for (const r of eligible) retryController.recordAttempt(r.accountId)

						const retryAccounts = eligible
							.map((r) => accounts.find((a) => a.id === r.accountId))
							.filter((a): a is NonNullable<typeof a> => a !== undefined)

						const retryResults = await runCheckout(retryAccounts)
						allResults.push(...retryResults)

						// Re-render summary with the full accumulated results; append to same CSV.
						const newPath = await renderSummary(allResults, startedAt, {
							retryHandler,
							reportFile: savedReportFile,
							retryController,
						})
						if (newPath) savedReportFile = newPath
					}

					const firstPath = await renderSummary(allResults, startedAt, { retryHandler, retryController })
					if (firstPath) savedReportFile = firstPath
				}

				// TODO: integrate WarmupController for scheduled drops (T-5:00 lead)
				// — for v1 we run drops as soon as the SKU resolves on the feed.
			} catch (err) {
				console.error(`❌ Run failed: ${maskCredentials(String(err))}`)
				process.exit(1)
			}
		},
	)

program
	.command('warmup')
	.description(
		'Pre-drop warmup: countdown + session validation + context pre-launch before a scheduled drop',
	)
	.requiredOption('--sku <sku>', 'Nike SKU / styleColor to watch (e.g. IQ7604-101)')
	.requiredOption('--drop-time <iso>', 'Scheduled drop time in ISO 8601 format (e.g. 2026-05-01T10:00:00Z)')
	.option('--sizes <sizes>', 'Target EU sizes comma-separated (e.g. 40,40.5,41)')
	.option('--lead-seconds <s>', 'Warmup lead time in seconds before drop (default: 300)', '300')
	.option('--dry-run', 'Pass dry-run flag to the checkout phase', false)
	.action(
		async (opts: {
			sku: string
			dropTime: string
			sizes?: string
			leadSeconds: string
			dryRun?: boolean
		}) => {
			const { maskCredentials } = await import('../logger/credentialMasker.ts')
			const { loadStoredAccounts } = await import('../auth/accountManager.ts')
			const { WarmupController } = await import('../monitor/warmupMode.ts')
			const { WarmupWidget } = await import('../tui/WarmupWidget.tsx')
			const { renderComponent, renderDashboard } = await import('../tui/renderDashboard.tsx')
			const { runParallelCheckout } = await import('../checkout/parallelCheckout.ts')
			const configPath = program.opts<{ config: string }>().config

			try {
				const dropTime = new Date(opts.dropTime)
				if (Number.isNaN(dropTime.getTime())) {
					console.error('❌ Invalid --drop-time; expected ISO 8601 format.')
					process.exit(1)
				}

				const accounts = await loadStoredAccounts()
				if (accounts.length === 0) {
					console.error('No accounts found. Run nike-bot import-accounts first.')
					process.exit(1)
				}

				const controller = new WarmupController()

				// Mount warmup TUI.
				const handle = renderComponent(WarmupWidget, { controller, dropTime })

				const result = await controller.start({
					dropTime,
					sku: opts.sku,
					accounts,
					leadSeconds: Number(opts.leadSeconds),
				})

				handle.unmount()

				// Transition to live dashboard + checkout.
				const productUrl = `https://www.nike.com/fr/launch/t/${result.slug}`
				const targetSizes = opts.sizes?.split(',').map((s) => s.trim()).filter(Boolean) ?? []

				const dashHandle = renderDashboard({
					sku: opts.sku,
					sizes: targetSizes,
					accountIds: result.validAccounts.map((a) => a.id),
					onFinished: () => { /* dashboard handles exit */ },
				})
				await runParallelCheckout({
					productUrl,
					targetSizes,
					dryRun: opts.dryRun ?? false,
					configPath,
					accounts: result.validAccounts,
					preLaunchedContexts: result.contexts,
				})
				dashHandle.unmount()
			} catch (err) {
				console.error(`❌ Warmup failed: ${maskCredentials(String(err))}`)
				process.exit(1)
			}
		},
	)
