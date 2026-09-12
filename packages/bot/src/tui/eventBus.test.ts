import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TuiEventBus, globalBus } from './eventBus.ts'
import type { TuiEvents } from './eventBus.ts'

test('TuiEventBus: subscriber receives accountStatusChanged payload', (_t, done) => {
	const bus = new TuiEventBus()
	const expected: TuiEvents['accountStatusChanged'] = {
		accountId: 'acc-1',
		status: { kind: 'waiting', step: 'selectSize' },
	}
	const off = bus.on('accountStatusChanged', (payload) => {
		assert.deepStrictEqual(payload, expected)
		off()
		done()
	})
	bus.emit('accountStatusChanged', expected)
})

test('TuiEventBus: subscriber receives checkoutFinished payload', (_t, done) => {
	const bus = new TuiEventBus()
	const expected: TuiEvents['checkoutFinished'] = {
		totalAccounts: 5,
		cops: 3,
		failures: 2,
	}
	const off = bus.on('checkoutFinished', (payload) => {
		assert.deepStrictEqual(payload, expected)
		off()
		done()
	})
	bus.emit('checkoutFinished', expected)
})

test('TuiEventBus: subscriber receives stepCompleted payload', (_t, done) => {
	const bus = new TuiEventBus()
	const expected: TuiEvents['stepCompleted'] = {
		accountId: 'acc-2',
		step: 'addToCart',
		durationMs: 420,
	}
	const off = bus.on('stepCompleted', (payload) => {
		assert.deepStrictEqual(payload, expected)
		off()
		done()
	})
	bus.emit('stepCompleted', expected)
})

test('TuiEventBus: off() unsubscribes listener — no more calls after off()', () => {
	const bus = new TuiEventBus()
	let callCount = 0
	const off = bus.on('warmupProgress', () => {
		callCount++
	})
	bus.emit('warmupProgress', { phase: 'polling' })
	assert.strictEqual(callCount, 1)
	off()
	bus.emit('warmupProgress', { phase: 'ready' })
	assert.strictEqual(callCount, 1, 'listener should not be called after off()')
})

test('TuiEventBus: multiple subscribers receive same event', () => {
	const bus = new TuiEventBus()
	let count = 0
	const off1 = bus.on('accountStatusChanged', () => count++)
	const off2 = bus.on('accountStatusChanged', () => count++)
	bus.emit('accountStatusChanged', { accountId: 'x', status: { kind: 'pending' } })
	assert.strictEqual(count, 2)
	off1()
	off2()
})

test('globalBus is a singleton TuiEventBus instance', async () => {
	// Verify it emits and receives — same instance imported twice
	const { globalBus: bus2 } = await import('./eventBus.ts')
	assert.strictEqual(globalBus, bus2)
})
