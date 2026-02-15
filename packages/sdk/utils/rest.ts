import { jsonRequest } from './jsonRequest.ts'

import type { RequestOptions } from './jsonRequest.ts'

export type GetOptions = Pick<RequestOptions, 'url' | 'signal' | 'abortTimeout' | 'retry'>

interface PostOptions extends GetOptions {
	body: any
}

const get = async <JsonResponse>(options: GetOptions): Promise<JsonResponse> => {
	return jsonRequest<JsonResponse>({ ...options, method: 'GET' })
}

const post = async <JsonResponse>(options: PostOptions): Promise<JsonResponse> => {
	return jsonRequest<JsonResponse>({ ...options, method: 'POST' })
}

export const rest = {
	get,
	post,
}
