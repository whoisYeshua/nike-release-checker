import { EventEmitter } from 'node:events'
import { resolveSkuToSlug, type SkuResolveResult } from './poller.ts'
import { validateSession } from '../auth/sessionValidator.ts'
import {
	createCheckoutContext,
	type CheckoutContextHandle,
} from '../checkout/checkoutPipeline.ts'
import { loadSelectorsForCountry } from '../country/selectorLoader.ts'
import type { AccountConfig } from '../config/accountSchema.ts'
import type { BotConfig } from '../config/botConfigSchema.ts'

/**
 * Pre-drop warmup pipeline: phased preparation before a scheduled drop.
 *
 * Phases:
 *   1. polling   — poll SDK product feed until SKU resolves to a slug.
 *   2. sessions  — validate cookie sessions for all accounts.
 *   3. contexts  — pre-launch Playwright contexts so click-to-ATC is minimal at T=0.
 *   4. ready     — drop time reached, hand off to checkout pipeline.
 *
 * Collapse: if SKU is already in the feed and `dropTime` is in the past,
 * skip phase waits and emit `collapsed` — stock is live, fire immediately.
 */

export type WarmupPhase = 'idle' | 'polling' | 'sessions' | 'contexts' | 'ready' | 'collapsed'

export interface WarmupProgress {
	phase: WarmupPhase
	tMinusSeconds: number
	slugResolved?: string
	sessionsValid?: number
	sessionsTotal?: number
	contextsReady?: number
}

/**
 * Pre-launched checkout context produced during the `contexts` phase.
 * Tests substitute a plain object (`{}`); production stores a real
 * `CheckoutContextHandle` with a live BrowserContext + Page.
 */
export type PreparedCheckoutContext = CheckoutContextHandle | unknown

export interface WarmupResult {
	slug: string
	validAccounts: AccountConfig[]
	contexts: Map<string, PreparedCheckoutContext>
}

export interface WarmupStartOptions {
	dropTime: Date
	sku: string
	accounts: AccountConfig[]
	leadSeconds?: number
	config?: BotConfig
}

/**
 * Dependency injection hooks for testing. Production code does not need these —
 * the defaults call the real modules. Tests can override via `__setWarmupDeps`.
 */
export interface WarmupDeps {
	resolveSkuToSlug: (
		sku: string,
		config: BotConfig | undefined,
		signal: AbortSignal,
		pollIntervalMs: number,
	) => Promise<SkuResolveResult>
	validateSessionStatus: (accountId: string) => Promise<boolean>
	createCheckoutContext: (account: AccountConfig) => Promise<PreparedCheckoutContext>
	sleep: (ms: number, signal: AbortSignal) => Promise<void>
	/** Eagerly warm the selector cache for a country code. */
	preloadSelectors: (countryCode: string) => Promise<void>
}

const defaultDeps: WarmupDeps = {
	resolveSkuToSlug: (sku, config, signal, pollIntervalMs) =>
		resolveSkuToSlug(sku, config, signal, pollIntervalMs),
	validateSessionStatus: async (accountId) => {
		const r = await validateSession(accountId)
		return r.status === 'valid'
	},
	createCheckoutContext: (account) => createCheckoutContext(account),
	preloadSelectors: async (cc) => {
		await loadSelectorsForCountry(cc)
	},
	sleep: (ms, signal) =>
		new Promise<void>((resolve) => {
			if (signal.aborted) {
				resolve()
				return
			}
			const timer = setTimeout(resolve, ms)
			signal.addEventListener(
				'abort',
				() => {
					clearTimeout(timer)
					resolve()
				},
				{ once: true },
			)
		}),
}

let activeDeps: WarmupDeps = defaultDeps

/** Test-only helper: override one or more dependencies for the next controller instance. */
export function __setWarmupDeps(overrides: Partial<WarmupDeps>): void {
	activeDeps = { ...defaultDeps, ...overrides }
}

/** Test-only helper: reset to production defaults. */
export function __resetWarmupDeps(): void {
	activeDeps = defaultDeps
}

export class WarmupController {
	private ee = new EventEmitter()
	private abort = new AbortController()
	private contexts = new Map<string, PreparedCheckoutContext>()
	private deps: WarmupDeps

	constructor(deps?: Partial<WarmupDeps>) {
		this.deps = { ...activeDeps, ...deps }
	}

	on(evt: 'progress', fn: (p: WarmupProgress) => void): () => void {
		this.ee.on(evt, fn)
		return () => {
			this.ee.off(evt, fn)
		}
	}

	async start(opts: WarmupStartOptions): Promise<WarmupResult> {
		const lead = opts.leadSeconds ?? 300
		const tMinus = (): number =>
			Math.round((opts.dropTime.getTime() - Date.now()) / 1000)

		// Phase 1: poll for slug
		this.ee.emit('progress', { phase: 'polling', tMinusSeconds: tMinus() })
		const skuResult = await this.deps.resolveSkuToSlug(
			opts.sku,
			opts.config,
			this.abort.signal,
			2000,
		)
		const slug = skuResult.slug

		// Collapse: stock already live
		if (tMinus() <= 0) {
			this.ee.emit('progress', {
				phase: 'collapsed',
				tMinusSeconds: tMinus(),
				slugResolved: slug,
			})
			return { slug, validAccounts: opts.accounts, contexts: this.contexts }
		}

		// Phase 2 (T-3:00): validate sessions
		const phase2Delay = Math.max(0, (tMinus() - lead + 120) * 1000)
		await this.deps.sleep(phase2Delay, this.abort.signal)
		if (this.abort.signal.aborted) {
			return { slug, validAccounts: [], contexts: this.contexts }
		}
		this.ee.emit('progress', {
			phase: 'sessions',
			tMinusSeconds: tMinus(),
			slugResolved: slug,
		})
		const validated = await Promise.all(
			opts.accounts.map(async (a) => ({
				account: a,
				ok: await this.deps.validateSessionStatus(a.id),
			})),
		)
		const validAccounts = validated.filter((v) => v.ok).map((v) => v.account)
		this.ee.emit('progress', {
			phase: 'sessions',
			tMinusSeconds: tMinus(),
			slugResolved: slug,
			sessionsValid: validAccounts.length,
			sessionsTotal: opts.accounts.length,
		})

		// Phase 3 (T-1:00): pre-launch Playwright contexts
		const phase3Delay = Math.max(0, (tMinus() - 60) * 1000)
		await this.deps.sleep(phase3Delay, this.abort.signal)
		if (this.abort.signal.aborted) {
			return { slug, validAccounts, contexts: this.contexts }
		}
		this.ee.emit('progress', {
			phase: 'contexts',
			tMinusSeconds: tMinus(),
			sessionsTotal: validAccounts.length,
		})

		// Eagerly pre-resolve selectors for every unique country in this drop's
		// account set. Cache hits at T=0 mean zero IO overhead during checkout.
		// For v3.0 (FR-only) this is a single call; future multi-country drops
		// benefit automatically.
		const uniqueCountries = [...new Set(validAccounts.map((a) => a.country))]
		await Promise.all(
			uniqueCountries.map((cc) => this.deps.preloadSelectors(cc)),
		)

		for (const a of validAccounts) {
			if (this.abort.signal.aborted) break
			const ctx = await this.deps.createCheckoutContext(a)
			this.contexts.set(a.id, ctx)
			this.ee.emit('progress', {
				phase: 'contexts',
				tMinusSeconds: tMinus(),
				contextsReady: this.contexts.size,
				sessionsTotal: validAccounts.length,
			})
		}

		// Phase 4 (T=0): ready
		const phase4Delay = Math.max(0, tMinus() * 1000)
		await this.deps.sleep(phase4Delay, this.abort.signal)
		this.ee.emit('progress', { phase: 'ready', tMinusSeconds: 0 })
		return { slug, validAccounts, contexts: this.contexts }
	}

	stop(): void {
		this.abort.abort()
	}
}
