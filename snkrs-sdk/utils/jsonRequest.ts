import { delay } from './delay.ts'
import { CustomError } from './Error.ts'
import { RateLimitError, HttpError } from './HttpError.ts'

interface RetryOptions {
	count: number
	/** ms */
	timeout?: number
}

export interface RequestOptions {
	url: URL
	method: 'GET' | 'POST'
	signal?: AbortSignal
	/** ms @default 30_000 */
	abortTimeout?: number
	retry?: RetryOptions
	body?: any
}

const DEFAULT_ABORT_TIMEOUT = 30 * 1000 // 30 seconds

const handleError = async (error: Error, options: RequestOptions): Promise<never> => {
	if (CustomError.isTimeoutError(error)) {
		console.error(
			`Timeout: It took more than ${DEFAULT_ABORT_TIMEOUT / 1000} seconds to get the result!`,
		)
	} else if (CustomError.isAbortError(error)) {
		console.error('Aborted by user action')
	} else if (error instanceof RateLimitError) {
		console.error(error)
		await delay(error.retryAfter, { signal: options.signal })
		return jsonRequest(options)
	} else if (error instanceof HttpError) {
		console.error(error)
		if (options.retry && options.retry.count > 0) {
			options.retry.count--
			if (options.retry.timeout) await delay(options.retry.timeout, { signal: options.signal })
			return jsonRequest(options)
		}
	}

	throw error
}
export const jsonRequest = async <JsonResponse>(options: RequestOptions): Promise<JsonResponse> => {
	const { url, method, signal, abortTimeout = DEFAULT_ABORT_TIMEOUT, body } = options

	try {
		const signalTimeout = AbortSignal.timeout(abortTimeout)
		const combinedSignal = signal ? AbortSignal.any([signalTimeout, signal]) : signalTimeout

		const response = await fetch(url, {
			method,
			signal: combinedSignal,
			headers: { 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		})

		if (!response.ok) {
			const rateLimitError = RateLimitError.fromResponse(response)
			if (rateLimitError) throw rateLimitError
			throw new HttpError(response.status)
		}

		return response.json()
	} catch (error) {
		if (error instanceof Error) return handleError(error, options)
		console.error('Unknown error')
		throw error
	}
}
