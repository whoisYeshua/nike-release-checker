import { CustomError } from './Error.ts'

export const delay = (ms: number, { signal }: { signal?: AbortSignal } = {}) => {
	const { promise, resolve, reject } = Promise.withResolvers()

	const abortHandler = () => {
		clearTimeout(timeout)
		reject(CustomError.createAbortError(signal?.reason))
	}
	signal?.addEventListener('abort', abortHandler, { once: true })

	const timeout = setTimeout(() => {
		signal?.removeEventListener('abort', abortHandler)
		resolve(undefined)
	}, ms)

	return promise
}
