import { type RequestOptions, jsonRequest } from './jsonRequest.ts'

export type GetOptions = Pick<RequestOptions, 'url' | 'signal' | 'abortTimeout' | 'retry'>

export interface PostOptions extends GetOptions {
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
