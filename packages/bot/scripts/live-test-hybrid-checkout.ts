#!/usr/bin/env tsx
// live-test-hybrid-checkout.ts — Task 9 (Story 12.7)
//
// Bootstraps a real Chrome session and runs runHybridPipeline in dry-run mode
// against a stable in-stock SKU. Prints per-step timings and total wall time.
// Runs N_RUNS consecutive iterations and computes p50/p95 wall time.
//
// Usage:
//   cd packages/bot
//   tsx scripts/live-test-hybrid-checkout.ts
//
// Requires:
//   - ACCOUNT_ID env var pointing to a valid account with a session snapshot
//   - PRODUCT_URL env var pointing to a stable in-stock PDP
//   - STYLE_COLOR env var (e.g. "CQ2559-001")
//   - SLUG env var (e.g. "air-max-90")
//   - TARGET_SIZE env var (EU size, e.g. "42")
//
// NFR30: total wall time from addItem → assertTotalMatches < 8s p95.

import { loadBotConfig } from '../src/config/botConfig.ts'
import { createCheckoutContext } from '../src/checkout/checkoutPipeline.ts'
import { runHybridPipeline } from '../src/checkout/pipelines/hybridPipeline.ts'
import type { AccountConfig } from '../src/config/accountSchema.ts'

const N_RUNS = 5
const ACCOUNT_ID = process.env['ACCOUNT_ID'] ?? 'default'
const PRODUCT_URL = process.env['PRODUCT_URL'] ?? 'https://www.nike.com/fr/t/air-max-90/CQ2559-001'
const STYLE_COLOR = process.env['STYLE_COLOR'] ?? 'CQ2559-001'
const SLUG = process.env['SLUG'] ?? 'air-max-90'
const TARGET_SIZE = process.env['TARGET_SIZE'] ?? '42'

function percentile(sorted: number[], p: number): number {
	const idx = Math.ceil(p / 100 * sorted.length) - 1
	return sorted[Math.max(0, idx)] ?? 0
}

async function main(): Promise<void> {
	const config = await loadBotConfig()

	const account: AccountConfig = {
		id: ACCOUNT_ID,
		email: `${ACCOUNT_ID}@example.com`,
		password: 'placeholder',
		country: 'FR',
		preferredSizes: [TARGET_SIZE],
		paymentMethod: 'PRE_SAVED',
	}

	const wallTimes: number[] = []

	console.log(`\n🧪 Running ${N_RUNS} hybrid pipeline dry-run iterations\n`)

	for (let i = 0; i < N_RUNS; i++) {
		const handle = await createCheckoutContext(account)
		const start = performance.now()

		try {
			const result = await runHybridPipeline(
				handle.page,
				account,
				{ ...config, checkout: { ...config.checkout, market: 'FR', language: 'fr', currency: 'EUR', defaultSizes: [], stepTimeoutMs: 8000, pipeline: 'hybrid' } },
				// Selectors: pass an empty object — for live test we rely on real Nike selectors
				{} as import('../src/config/selectorSchema.ts').Selectors,
				{
					productUrl: PRODUCT_URL,
					targetSizes: [TARGET_SIZE],
					styleColor: STYLE_COLOR,
					slug: SLUG,
					country: 'FR',
					currency: 'EUR',
					dryRun: true,
				},
			)

			const wall = Math.round(performance.now() - start)
			wallTimes.push(wall)

			console.log(`Run ${i + 1}/${N_RUNS} — ${result.finalOutcome} — ${wall}ms`)
			for (const step of result.steps) {
				console.log(`  ${step.outcome === 'success' ? '✔' : '✗'} ${step.step} (${step.durationMs}ms)${step.details ? ` [${step.details}]` : ''}`)
			}
		} catch (e) {
			const wall = Math.round(performance.now() - start)
			wallTimes.push(wall)
			console.error(`Run ${i + 1}/${N_RUNS} — ERROR after ${wall}ms:`, e instanceof Error ? e.message : e)
		} finally {
			await handle.close().catch(() => undefined)
		}

		// Small gap between runs to avoid rate-limiting.
		if (i < N_RUNS - 1) await new Promise<void>((r) => setTimeout(r, 500))
	}

	const sorted = [...wallTimes].sort((a, b) => a - b)
	const p50 = percentile(sorted, 50)
	const p95 = percentile(sorted, 95)

	console.log('\n─── Timing Summary ───────────────────────────────')
	console.log(`Runs: ${N_RUNS}`)
	console.log(`p50 wall time: ${p50}ms`)
	console.log(`p95 wall time: ${p95}ms`)
	console.log(`NFR30 target: < 8000ms p95 → ${p95 < 8000 ? 'PASS ✔' : 'FAIL ✗'}`)
	console.log('──────────────────────────────────────────────────\n')

	if (p95 >= 8000) process.exit(1)
}

main().catch((e) => {
	console.error('Fatal:', e)
	process.exit(1)
})
