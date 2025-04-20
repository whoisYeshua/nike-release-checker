import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { RateLimitError } from './HttpError.ts'

describe('RateLimitError', () => {
	test('Class should set statusCode, message, and retryAfter correctly', () => {
		const response = new Response(null, {
			status: 429,
			headers: { 'Retry-After': '10' },
		})
		const error = new RateLimitError(response)

		assert.strictEqual(error.statusCode, 429)
		assert.strictEqual(error.message, 'Too many requests to resource, cooldown in 10 seconds.')
		assert.strictEqual(error.retryAfter, 10000)
	})

	test('Class should default retryAfter to 5 seconds if header is not present', () => {
		const response = new Response(null, {
			status: 429,
		})
		const error = new RateLimitError(response)

		assert.strictEqual(error.statusCode, 429)
		assert.strictEqual(error.message, 'Too many requests to resource, cooldown in 5 seconds.')
		assert.strictEqual(error.retryAfter, 5000)
	})

	test('RateLimitError.fromResponse should return RateLimitError if status is 429', () => {
		const response = new Response(null, {
			status: 429,
			headers: { 'Retry-After': '10' },
		})
		const error = RateLimitError.fromResponse(response)

		assert.ok(error instanceof RateLimitError)
		assert.strictEqual(error?.statusCode, 429)
	})

	test('RateLimitError.fromResponse should return null if status is not 429', () => {
		const response = new Response(null, {
			status: 200,
		})
		const error = RateLimitError.fromResponse(response)

		assert.strictEqual(error, null)
	})
})
