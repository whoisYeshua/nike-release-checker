import * as v from 'valibot'

export const BotConfigSchema = v.object({
	polling: v.optional(
		v.object({
			interval: v.optional(v.pipe(v.number(), v.minValue(1000)), 5000),
			timeout: v.optional(v.pipe(v.number(), v.minValue(5000)), 30000),
		}),
		{ interval: 5000, timeout: 30000 },
	),
	checkout: v.optional(
		v.object({
			market: v.optional(v.string(), 'FR'),
			language: v.optional(v.string(), 'fr'),
			currency: v.optional(v.string(), 'EUR'),
			defaultSizes: v.optional(v.array(v.string()), []),
			stepTimeoutMs: v.optional(v.pipe(v.number(), v.minValue(1000)), 8000),
			/**
			 * Pipeline mode. Default: 'dom' for self-hosted, 'hybrid' for SaaS.
			 * See HYBRID_PIPELINE.md for step ownership table.
			 */
			pipeline: v.optional(v.picklist(['dom', 'hybrid'] as const)),
			/**
			 * Deployment tier. When 'saas' and pipeline is unset, defaults to 'hybrid'.
			 */
			tier: v.optional(v.picklist(['self-hosted', 'saas'] as const)),
		}),
		{ market: 'FR', language: 'fr', currency: 'EUR', defaultSizes: [], stepTimeoutMs: 8000 },
	),
	proxy: v.optional(
		v.object({
			rotationMode: v.optional(v.picklist(['per-account']), 'per-account'),
			testOnImport: v.optional(v.boolean(), true),
		}),
		{ rotationMode: 'per-account', testOnImport: true },
	),
	stealth: v.optional(
		v.object({
			headless: v.optional(v.boolean(), true),
			userAgent: v.optional(v.string(), 'auto'),
		}),
		{ headless: true, userAgent: 'auto' },
	),
	daemon: v.optional(
		v.object({
			logFile: v.optional(v.string(), './logs/bot.log'),
			pidFile: v.optional(v.string(), './bot.pid'),
		}),
		{ logFile: './logs/bot.log', pidFile: './bot.pid' },
	),
	kpsdk: v.optional(
		v.object({
			tokenTtlMs: v.optional(v.pipe(v.number(), v.minValue(0)), 600_000),
		}),
		{ tokenTtlMs: 600_000 },
	),
})

export type BotConfig = v.InferOutput<typeof BotConfigSchema>
