import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'

import { delay } from './delay.ts'
import { CustomError } from './Error.ts'

import type { Mock } from 'node:test'

describe('delay', () => {
	const originalSetTimeout = global.setTimeout
	const originalClearTimeout = global.clearTimeout

	let mockedSetTimeout: Mock<typeof originalSetTimeout>
	let mockedClearTimeout: Mock<typeof originalClearTimeout>

	beforeEach(() => {
		mockedSetTimeout = mock.fn(originalSetTimeout)
		mockedClearTimeout = mock.fn(originalClearTimeout)

		// Mock gloabal methods
		global.setTimeout = mockedSetTimeout
		global.clearTimeout = mockedClearTimeout
	})

	afterEach(() => {
		mock.reset()

		// Restore original methods
		global.setTimeout = originalSetTimeout
		global.clearTimeout = originalClearTimeout
	})

	test('should call setTimeout after the specified time', async () => {
		const delayMs = 10000
		mockedSetTimeout.mock.mockImplementation(((cb: Function) => cb()) as any)

		await delay(delayMs)

		const [_, setTimeoutDelay] = mockedSetTimeout.mock.calls[0].arguments
		assert.strictEqual(setTimeoutDelay, delayMs)
	})

	test('should reject with AbortError if signal is aborted', async () => {
		const controller = new AbortController()
		const { signal } = controller

		queueMicrotask(() => controller.abort())

		await assert.rejects(
			() => delay(100, { signal }),
			(error: unknown) => {
				assert.ok(CustomError.isAbortError(error))
				return true
			}
		)
		assert.ok(mockedClearTimeout.mock.callCount(), 'should clear delay timeout when reject')
	})

	test('should remove abort event listener when successfully resolve delay', async () => {
		const signal = new AbortController().signal
		mock.method(signal, 'removeEventListener')

		await delay(0, { signal })
		assert.ok(
			(signal.removeEventListener as Mock<typeof signal.removeEventListener>).mock.callCount()
		)
	})

	test('should handle zero delay correctly', async () => {
		mockedSetTimeout.mock.mockImplementation(((cb: Function) => cb()) as any)
		await delay(0)
		assert.strictEqual(mockedSetTimeout.mock.callCount(), 1)
	})

	test('should pass negative delay to setTimeout as is', async () => {
		mockedSetTimeout.mock.mockImplementation(((cb: Function) => cb()) as any)
		await delay(-100)
		const [_, setTimeoutDelay] = mockedSetTimeout.mock.calls[0].arguments
		assert.strictEqual(setTimeoutDelay, -100)
	})

	test('should not add abort listener when signal is not provided', async () => {
		const signal = new AbortController().signal
		mock.method(signal, 'addEventListener')

		await delay(0)
		assert.strictEqual(
			(signal.addEventListener as Mock<typeof signal.addEventListener>).mock.callCount(),
			0
		)
	})

	test('should handle abort with custom reason', async () => {
		const controller = new AbortController()
		const { signal } = controller
		const customReason = new Error('Custom abort reason')

		queueMicrotask(() => controller.abort(customReason))

		await assert.rejects(
			() => delay(100, { signal }),
			(error: unknown) => error === customReason
		)
	})
})
