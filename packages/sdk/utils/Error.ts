export class CustomError extends Error {
	static isAbortError(error: unknown) {
		return error instanceof Error && error.name === 'AbortError'
	}

	static createAbortError(reason?: any) {
		return reason ?? new DOMException('This operation was aborted', 'AbortError')
	}

	static isTimeoutError(error: unknown) {
		return error instanceof Error && error.name === 'TimeoutError'
	}

	constructor(message: string) {
		super(message)
		this.name = this.constructor.name
	}
}
