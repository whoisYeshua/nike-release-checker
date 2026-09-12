import { describe, it, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import {
	WarmupController,
	type WarmupDeps,
	type WarmupProgress,
} from './warmupMode.ts'
import type { AccountConfig } from '../config/accountSchema.ts'
import type { SkuResolveResult } from './poller.ts'

function mkAccount(id: string): AccountConfig {
	return {
		id,
		email: `${id}@test.com`,
		password: 'pw',
		country: 'FR',
		preferredSizes: [],
		paymentMethod: 'PRE_SAVED',
	}
}

function mkDeps(overrides: Partial<WarmupDeps> = {}): WarmupDeps {
	return {
		resolveSkuToSlug: async (sku): Promise<SkuResolveResult> => ({
			slug: `slug-for-${sku.toLowerCase()}`,
			productUrl: `https://www.nike.com/fr/launch/t/slug-for-${sku.toLowerCase()}`,
			styleColor: sku,
		}),
		validateSessionStatus: async () => true,
		createCheckoutContext: async () => ({ ok: true }),
		sleep: async () => {
			/* instant for tests */
		},
		preloadSelectors: async () => {
			/* no-op in tests */
		},
		...overrides,
	}
}

describe('WarmupController', () => {
	let progress: WarmupProgress[]

	beforeEach(() => {
		progress = []
	})

	it('fires phase transitions in order: polling → sessions → contexts → ready', async () => {
		const accounts = [mkAccount('a1'), mkAccount('a2')]
		const ctrl = new WarmupController(mkDeps())
		ctrl.on('progress', (p) => progress.push(p))

		const dropTime = new Date(Date.now() + 5 * 60 * 1000)
		const result = await ctrl.start({
			dropTime,
			sku: 'IQ7604-101',
			accounts,
			leadSeconds: 300,
		})

		const phaseOrder = progress.map((p) => p.phase)
		// Should have polling first, ending with ready; sessions + contexts in between.
		assert.equal(phaseOrder[0], 'polling', 'first emit is polling')
		assert.equal(
			phaseOrder[phaseOrder.length - 1],
			'ready',
			'last emit is ready',
		)
		const firstSessions = phaseOrder.indexOf('sessions')
		const firstContexts = phaseOrder.indexOf('contexts')
		const firstReady = phaseOrder.indexOf('ready')
		assert.ok(firstSessions > 0, 'sessions phase emitted')
		assert.ok(firstContexts > firstSessions, 'contexts after sessions')
		assert.ok(firstReady > firstContexts, 'ready after contexts')

		assert.equal(result.slug, 'slug-for-iq7604-101')
		assert.equal(result.validAccounts.length, 2)
		assert.equal(result.contexts.size, 2)
	})

	it('collapses when dropTime is already in the past (stock live)', async () => {
		const accounts = [mkAccount('a1')]
		const ctrl = new WarmupController(mkDeps())
		ctrl.on('progress', (p) => progress.push(p))

		const dropTime = new Date(Date.now() - 10 * 1000)
		const result = await ctrl.start({
			dropTime,
			sku: 'IQ7604-101',
			accounts,
			leadSeconds: 300,
		})

		const phases = progress.map((p) => p.phase)
		assert.equal(phases[0], 'polling')
		assert.ok(phases.includes('collapsed'), 'collapsed phase emitted')
		assert.ok(!phases.includes('sessions'), 'sessions phase skipped')
		assert.ok(!phases.includes('contexts'), 'contexts phase skipped')
		assert.ok(!phases.includes('ready'), 'ready phase skipped')
		assert.equal(result.slug, 'slug-for-iq7604-101')
	})

	it('filters invalid sessions from validAccounts', async () => {
		const accounts = [mkAccount('ok1'), mkAccount('bad'), mkAccount('ok2')]
		const ctrl = new WarmupController(
			mkDeps({
				validateSessionStatus: async (id) => id !== 'bad',
			}),
		)
		ctrl.on('progress', (p) => progress.push(p))

		const result = await ctrl.start({
			dropTime: new Date(Date.now() + 5 * 60 * 1000),
			sku: 'IQ7604-101',
			accounts,
		})

		assert.equal(result.validAccounts.length, 2)
		assert.deepEqual(
			result.validAccounts.map((a) => a.id),
			['ok1', 'ok2'],
		)
		const sessionsEmits = progress.filter(
			(p) => p.phase === 'sessions' && p.sessionsValid !== undefined,
		)
		assert.equal(sessionsEmits[sessionsEmits.length - 1]?.sessionsValid, 2)
		assert.equal(sessionsEmits[sessionsEmits.length - 1]?.sessionsTotal, 3)
	})

	it('stop() aborts the pipeline via AbortSignal', async () => {
		let resolveFeed: (v: SkuResolveResult) => void = () => {}
		const pending = new Promise<SkuResolveResult>((r) => {
			resolveFeed = r
		})

		const ctrl = new WarmupController(
			mkDeps({
				resolveSkuToSlug: async (_sku, _cfg, signal) => {
					return new Promise<SkuResolveResult>((resolve, reject) => {
						signal.addEventListener('abort', () => {
							reject(new Error('aborted'))
						})
						void pending.then(resolve)
					})
				},
			}),
		)

		const startPromise = ctrl.start({
			dropTime: new Date(Date.now() + 5 * 60 * 1000),
			sku: 'IQ7604-101',
			accounts: [mkAccount('a1')],
		})

		// Abort before feed resolves.
		ctrl.stop()
		void resolveFeed // satisfy lint — never called

		await assert.rejects(startPromise, /aborted/)
	})
})
