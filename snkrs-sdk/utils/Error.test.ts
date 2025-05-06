import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CustomError } from './Error.ts'

describe('CustomError', () => {
	test('should correctly identify AbortError', () => {
		const abortError = new Error('Abort error')
		abortError.name = 'AbortError'
		assert.strictEqual(CustomError.isAbortError(abortError), true)
		assert.strictEqual(CustomError.isAbortError(new Error('Regular error')), false)
	})

	test('should correctly identify TimeoutError', () => {
		const timeoutError = new Error('Timeout error')
		timeoutError.name = 'TimeoutError'
		assert.strictEqual(CustomError.isTimeoutError(timeoutError), true)
		assert.strictEqual(CustomError.isTimeoutError(new Error('Regular error')), false)
	})

	test('should not identify non-Error objects as AbortError or TimeoutError', () => {
		const nonError = { name: 'AbortError' }
		assert.strictEqual(CustomError.isAbortError(nonError), false)
		assert.strictEqual(CustomError.isTimeoutError(nonError), false)
	})

	test('createAbortError should return the provided reason if given', () => {
		const reason = new Error('Custom abort reason')
		const result = CustomError.createAbortError(reason)
		assert.strictEqual(result, reason)
	})

	test('createAbortError should return a new DOMException if no reason is provided', () => {
		const result = CustomError.createAbortError()
		assert.strictEqual(result.name, 'AbortError')
		assert.strictEqual(result.message, 'This operation was aborted')
		assert.ok(result instanceof DOMException)
	})

	test('constructor should set correct name and message', () => {
		const error = new CustomError('Test error message')
		assert.strictEqual(error.name, 'CustomError')
		assert.strictEqual(error.message, 'Test error message')
		assert.ok(error instanceof Error)
	})
})
