import { describe, test, beforeEach, afterEach, mock, type Mock } from 'node:test'
import assert from 'node:assert/strict'
import { jsonRequest } from './jsonRequest.ts'
import { HttpError } from './HttpError.ts'
import { CustomError } from './Error.ts'

import type { RequestOptions } from './jsonRequest.ts'

describe('jsonRequest', () => {
	const defaultOptions: RequestOptions = {
		url: new URL('http://example.com'),
		method: 'GET',
	}

	const originalConsoleError = global.console.error
	const originalFetch = global.fetch
	const originalSetTimeout = global.setTimeout
	const originalAbortSignal = global.AbortSignal

	let mockedConsoleError: Mock<VoidFunction>
	let mockedFetch: Mock<typeof originalFetch>
	let mockedSetTimeout: Mock<typeof originalSetTimeout>

	beforeEach(() => {
		mockedConsoleError = mock.fn()
		mockedFetch = mock.fn(originalFetch)
		mockedSetTimeout = mock.fn(originalSetTimeout)

		// Mock gloabal methods
		global.console.error = mockedConsoleError // to prevent junks in console during test
		global.fetch = mockedFetch
		global.setTimeout = mockedSetTimeout
	})

	afterEach(() => {
		mock.reset()

		// Restore original methods
		global.console.error = originalConsoleError
		global.setTimeout = originalSetTimeout
		global.fetch = originalFetch
		global.AbortSignal = originalAbortSignal
	})

	test('should successfully fetch and parse JSON', async () => {
		const mockResponse = { data: 'test' }
		mockedFetch.mock.mockImplementation(
			async () => new Response(JSON.stringify(mockResponse), { status: 200 }),
		)

		const result = await jsonRequest(defaultOptions)
		assert.deepStrictEqual(result, mockResponse)
	})

	test('should throw error if response is not JSON', async () => {
		mockedFetch.mock.mockImplementation(async () => new Response(null, { status: 204 }))

		await assert.rejects(
			() => jsonRequest(defaultOptions),
			(error: unknown) => {
				assert.ok(error instanceof SyntaxError)
				return true
			},
		)
	})

	test('should handle RateLimitError', async () => {
		const mockedResponse = { data: 'test' }
		mockedFetch.mock.mockImplementation(async () => {
			if (mockedFetch.mock.callCount() < 1) {
				return new Response(null, { status: 429, headers: { 'Retry-After': '4' } })
			}
			return new Response(JSON.stringify(mockedResponse), { status: 200 })
		})
		mockedSetTimeout.mock.mockImplementation(((cb: Function) => cb()) as any)

		const result = await jsonRequest(defaultOptions)

		assert.strictEqual(mockedFetch.mock.callCount(), 2, 'fetch should be called twice')
		assert.deepStrictEqual(result, mockedResponse, 'should return successful response after retry')
	})

	test('should handle HttpError', async () => {
		mockedFetch.mock.mockImplementation(async () => new Response(null, { status: 404 }))

		await assert.rejects(
			() => jsonRequest(defaultOptions),
			(error: unknown) => {
				assert.ok(error instanceof HttpError)
				assert.strictEqual(error.statusCode, 404)
				return true
			},
		)
	})

	test('should handle AbortError', async () => {
		const abortController = new AbortController()
		const options: RequestOptions = { ...defaultOptions, signal: abortController.signal }

		abortController.abort()

		await assert.rejects(
			() => jsonRequest(options),
			(error: unknown) => {
				assert.ok(CustomError.isAbortError(error))
				return true
			},
		)
	})

	test('should handle abort TimeoutError', async () => {
		global.AbortSignal = { timeout: () => originalAbortSignal.timeout(0) } as any

		await assert.rejects(
			() => jsonRequest(defaultOptions),
			(error: unknown) => {
				assert.ok(CustomError.isTimeoutError(error))
				return true
			},
		)
	})

	test('should set default abortTimeout to 30 sec if not presented in options', async () => {
		const mockedAbortSignalTimeout = mock.fn(originalAbortSignal.timeout)
		mock.method(global.AbortSignal, 'timeout', mockedAbortSignalTimeout)
		mockedFetch.mock.mockImplementation(
			async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
		)

		await jsonRequest(defaultOptions)

		const [timeout] = mockedAbortSignalTimeout.mock.calls[0].arguments
		assert.strictEqual(timeout, 30_000)
	})

	test('should wait if provided timeout for retry', async () => {
		const mockResponse = { success: true }
		const retryCount = 1
		const retryTimeout = 5000
		mockedFetch.mock.mockImplementation(async () => {
			if (mockedFetch.mock.callCount() < retryCount) return new Response(null, { status: 500 }) // Simulate server error
			return new Response(JSON.stringify(mockResponse), { status: 200 })
		})
		mockedSetTimeout.mock.mockImplementation(((cb: Function) => cb()) as any)

		const options: RequestOptions = {
			...defaultOptions,
			retry: { count: retryCount, timeout: retryTimeout },
		}

		const result = await jsonRequest(options)

		const [_cb, timeout] = mockedSetTimeout.mock.calls[0].arguments

		assert.strictEqual(mockedSetTimeout.mock.callCount(), retryCount)
		assert.strictEqual(timeout, retryTimeout)
		assert.strictEqual(mockedFetch.mock.callCount(), retryCount + 1)
		assert.deepStrictEqual(result, mockResponse, 'should return successful response after retry')
	})

	test('should retry on error if retry option is set', async () => {
		const mockResponse = { success: true }
		const retryCount = 2

		mockedFetch.mock.mockImplementation(async () => {
			if (mockedFetch.mock.callCount() < retryCount) return new Response(null, { status: 404 })
			return new Response(JSON.stringify(mockResponse), { status: 200 })
		})

		const options: RequestOptions = { ...defaultOptions, retry: { count: retryCount, timeout: 0 } }
		const result = await jsonRequest(options)

		assert.deepStrictEqual(result, mockResponse)
		assert.strictEqual(mockedFetch.mock.callCount(), retryCount + 1)
	})

	test('should not retry on error if retry option is set to 0', async () => {
		mockedFetch.mock.mockImplementation(async () => new Response(null, { status: 404 }))

		const options: RequestOptions = { ...defaultOptions, retry: { count: 0, timeout: 0 } }

		await assert.rejects(() => jsonRequest(options))
		assert.strictEqual(mockedFetch.mock.callCount(), 1)
	})

	test('should send POST request with body', async () => {
		const mockResponse = { success: true }
		const requestBody = { key: 'value' }

		mockedFetch.mock.mockImplementation(
			async () => new Response(JSON.stringify(mockResponse), { status: 200 }),
		)

		const options: RequestOptions = { ...defaultOptions, method: 'POST', body: requestBody }

		await jsonRequest(options)

		const [_url, option] = mockedFetch.mock.calls[0].arguments
		const receivedBody = JSON.parse(option?.body as string)
		await assert.deepStrictEqual(receivedBody, requestBody)
	})
})
