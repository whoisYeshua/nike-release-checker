// Convenience runner for the gated live cart API integration test.
//
// Usage (with required env vars):
//   RUN_LIVE_TESTS=1 \
//   NIKE_TEST_ACCOUNT=<accountId> \
//   NIKE_TEST_PDP="https://www.nike.com/fr/t/<slug>/<styleColor>" \
//   NIKE_TEST_SKU=<skuId> \
//   NIKE_TEST_SLUG=<slug> \
//   NIKE_TEST_STYLE_COLOR=<styleColor> \
//   node --import tsx packages/bot/scripts/live-test-cart-api.ts
//
// This script just spawns `node --test` against the live integration spec so
// developers don't have to remember the long node CLI invocation.

import { spawn } from 'node:child_process'

if (process.env.RUN_LIVE_TESTS !== '1') {
	console.error(
		'[live-test-cart-api] Refusing to run: set RUN_LIVE_TESTS=1 to opt in.',
	)
	process.exit(2)
}

const child = spawn(
	process.execPath,
	[
		'--import',
		'tsx',
		'--test',
		'packages/bot/test/integration/cartApi.live.test.ts',
	],
	{ stdio: 'inherit', env: process.env },
)

// Forward Ctrl+C / SIGTERM so the child Playwright process is not orphaned.
const forward = (sig: NodeJS.Signals) => {
	child.kill(sig)
}
process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))

child.on('error', (err) => {
	console.error('[live-test-cart-api] spawn error:', err)
	process.exit(1)
})

child.on('exit', (code, signal) => {
	if (signal !== null) {
		// Mimic shell convention: 128 + signal number, fallback to 1.
		const sigNum = signalNumber(signal)
		process.exit(128 + sigNum)
	}
	process.exit(code ?? 1)
})

function signalNumber(signal: NodeJS.Signals): number {
	const map: Partial<Record<NodeJS.Signals, number>> = {
		SIGINT: 2,
		SIGTERM: 15,
		SIGHUP: 1,
		SIGQUIT: 3,
		SIGKILL: 9,
	}
	return map[signal] ?? 0
}
