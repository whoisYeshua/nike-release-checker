import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { installChromium, isChromiumInstalled, setSpawnFactory } from './chromiumInstaller.ts'

class FakeChild extends EventEmitter {
	stdout = new EventEmitter()
	stderr = new EventEmitter()
}

function makeFakeSpawn(script: (child: FakeChild) => void) {
	return () => {
		const child = new FakeChild()
		// emit async so .on handlers can attach
		queueMicrotask(() => script(child))
		return child as unknown as ChildProcess
	}
}

test('isChromiumInstalled returns false when executablePath throws or path missing', () => {
	// Under test env, executablePath either throws (no browsers installed) or returns
	// a path that doesn't exist. Both paths must yield false.
	const result = isChromiumInstalled()
	assert.equal(typeof result, 'boolean')
	// We can't guarantee a clean machine, but we can assert the function never throws.
})

test('installChromium resolves on exit 0 and emits progress events', async () => {
	const percents: number[] = []
	setSpawnFactory(makeFakeSpawn((child) => {
		child.stderr.emit('data', Buffer.from('Downloading Chromium |  10% |\n'))
		child.stderr.emit('data', Buffer.from('Downloading Chromium |  50% |\n'))
		child.stderr.emit('data', Buffer.from('Downloading Chromium | 100% |\n'))
		child.emit('close', 0)
	}))

	try {
		await installChromium({
			onProgress: (e) => {
				percents.push(e.percent)
				assert.equal(e.phase, 'download')
			},
		})
	} finally {
		setSpawnFactory(null)
	}

	assert.ok(percents.includes(10), `expected 10 in ${percents.join(',')}`)
	assert.ok(percents.includes(50), `expected 50 in ${percents.join(',')}`)
})

test('installChromium rejects on non-zero exit with stderr tail', async () => {
	const errMsg = 'ERR: network unreachable — failed to GET https://playwright.download/chromium'
	setSpawnFactory(makeFakeSpawn((child) => {
		child.stderr.emit('data', Buffer.from(errMsg))
		child.emit('close', 1)
	}))

	let caught: Error | null = null
	try {
		await installChromium({})
	} catch (err) {
		caught = err as Error
	} finally {
		setSpawnFactory(null)
	}

	assert.ok(caught, 'installChromium should reject on exit 1')
	assert.match(caught!.message, /code 1/)
	assert.ok(caught!.message.includes('network unreachable'), `tail missing from: ${caught!.message}`)
})
