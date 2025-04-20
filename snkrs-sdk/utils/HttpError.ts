import { CustomError } from './Error.ts'

export class HttpError extends CustomError {
	statusCode: number

	constructor(statusCode: number, message?: string) {
		const defaultMessage = `HTTP error code: ${statusCode}`
		super(message ? message : defaultMessage)
		this.statusCode = statusCode
	}
}

// Extend HTTPError to handle 429 specifically
export class RateLimitError extends HttpError {
	static statusCode = 429

	retryAfter: number // ms

	constructor(response: Response) {
		const retryAfterSeconds = Math.abs(parseInt(response.headers.get('Retry-After') ?? '5', 10)) // Default to 5 seconds if Retry-After is not present
		super(
			RateLimitError.statusCode,
			`Too many requests to resource, cooldown in ${retryAfterSeconds} seconds.`,
		)
		this.retryAfter = retryAfterSeconds * 1000
	}

	static fromResponse(response: Response): RateLimitError | null {
		if (response.status === RateLimitError.statusCode) {
			return new RateLimitError(response)
		}
		return null
	}
}
