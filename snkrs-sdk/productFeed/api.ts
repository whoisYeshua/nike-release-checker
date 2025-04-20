import { getProductFeedUrl } from './url.ts'
import { rest, type GetOptions } from '../utils/rest.ts'

import type { ProductFeedUrlParams } from './url.ts'
import type { ProductFeedResponse } from './model.ts'

type GetProductFeedParams = ProductFeedUrlParams & Omit<GetOptions, 'url'>

export const getProductFeed = async (params: GetProductFeedParams) => {
	const url = getProductFeedUrl(params)
	const response = await rest.get<ProductFeedResponse>({ url, ...params })
	return response.objects
}
