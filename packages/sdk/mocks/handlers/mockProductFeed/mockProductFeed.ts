import { delay, http, HttpResponse } from 'msw'

import { mockGetProductFeedData } from './mockProductFeedData.ts'

const mockGetProductFeed = http.get(`https://api.nike.com/product_feed/threads/v3/`, async () => {
	const body = mockGetProductFeedData
	await delay()
	return HttpResponse.json(body)
})

export const mockProductFeed = [mockGetProductFeed]
