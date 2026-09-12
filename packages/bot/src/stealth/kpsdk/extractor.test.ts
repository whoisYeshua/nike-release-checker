import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { KpsdkExtractor } from './extractor.js'
import type { KpsdkToken } from './types.js'

// ---------------------------------------------------------------------------
// Minimal fake Page — shape compatible with what KpsdkExtractor needs.
// ---------------------------------------------------------------------------

type RequestListener = (req: FakeRequest) => void

interface FakeRequest {
	url(): string
	headers(): Record<string, string>
}

interface FetchCall {
	url: string
	options: Record<string, unknown>
}

function makeFakePage() {
	const listeners: RequestListener[] = []
	const fetchCalls: FetchCall[] = []

	const page = {
		on(_event: string, fn: RequestListener) {
			listeners.push(fn)
		},
		off(_event: string, fn: RequestListener) {
			const idx = listeners.indexOf(fn)
			if (idx !== -1) listeners.splice(idx, 1)
		},
		request: {
			async fetch(url: string, options: Record<string, unknown>) {
				fetchCalls.push({ url, options })
				// Simulate a network response (content doesn't matter)
				return { status: () => 403, body: async () => Buffer.from('') }
			},
		},
		emit(req: FakeRequest) {
			for (const fn of listeners) {
				fn(req)
			}
		},
		get listenerCount() {
			return listeners.length
		},
		get fetchCalls() {
			return fetchCalls
		},
	}

	return page
}

type FakePage = ReturnType<typeof makeFakePage>

// Cast helper — lets us pass FakePage where Page is expected without full Playwright mock
function asPage(p: FakePage) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return p as unknown as import('playwright').Page
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KpsdkExtractor', () => {
	it('Test 1: captures token from a protected request with both headers', async () => {
		const page = makeFakePage()
		const extractor = new KpsdkExtractor(asPage(page), 'FR')
		extractor.attach()

		page.emit({
			url: () => 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM',
			headers: () => ({ 'x-kpsdk-ct': 'ct-value-abc', 'x-kpsdk-v': 'v-value-xyz' }),
		})

		const token: KpsdkToken | null = await extractor.getToken()
		assert.ok(token !== null, 'token should not be null')
		assert.equal(token.ct, 'ct-value-abc')
		assert.equal(token.v, 'v-value-xyz')
		assert.equal(token.source, 'request')
		assert.ok(token.capturedAt instanceof Date)
	})

	it('Test 2: does not capture when x-kpsdk-ct is missing', async () => {
		const page = makeFakePage()
		const extractor = new KpsdkExtractor(asPage(page), 'FR')
		extractor.attach()

		page.emit({
			url: () => 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM',
			headers: () => ({ 'x-kpsdk-v': 'v-only' }),
		})

		// No token yet — force-fire will be called but our fake fetch records the call
		// and the listener still won't capture (no ct header). Token stays null.
		const token = await extractor.getToken()
		assert.equal(token, null)
	})

	it('Test 3: ignores non-protected URLs even if KPSDK headers are present', async () => {
		const page = makeFakePage()
		const extractor = new KpsdkExtractor(asPage(page), 'FR')
		extractor.attach()

		page.emit({
			url: () => 'https://cdn.nike.com/styles.css',
			headers: () => ({ 'x-kpsdk-ct': 'ct-value', 'x-kpsdk-v': 'v-value' }),
		})

		// Only the force-fire fetch will happen (no cached token)
		const token = await extractor.getToken()
		assert.equal(token, null, 'non-protected URL should be ignored')
		// Confirm force-fire was attempted
		assert.equal(page.fetchCalls.length, 1)
	})

	it('Test 4: getToken() with no cached token triggers forceFireProtectedRequest with correct URL', async () => {
		const page = makeFakePage()
		const extractor = new KpsdkExtractor(asPage(page), 'US')
		extractor.attach()

		// No request emitted yet
		await extractor.getToken()

		assert.equal(page.fetchCalls.length, 1)
		const call = page.fetchCalls[0]
		assert.ok(call !== undefined)
		assert.ok(
			call.url.includes('/buy/carts/v2/US/NIKE/NIKECOM'),
			`expected US cart URL, got: ${call.url}`,
		)
	})

	it('Test 5: detach() removes the listener and subsequent emits do not update state', async () => {
		const page = makeFakePage()
		const extractor = new KpsdkExtractor(asPage(page), 'FR')
		extractor.attach()

		assert.equal(page.listenerCount, 1, 'listener should be attached')

		extractor.detach()
		assert.equal(page.listenerCount, 0, 'listener should be removed after detach')

		// Emit a valid protected request after detach — should be ignored
		page.emit({
			url: () => 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM',
			headers: () => ({ 'x-kpsdk-ct': 'ct-post-detach', 'x-kpsdk-v': 'v-post-detach' }),
		})

		// Force fire will happen since no token. But listener is detached so still null.
		const token = await extractor.getToken()
		assert.equal(token, null)
	})

	it('Test 6: listener exception does not propagate', () => {
		const page = makeFakePage()
		const extractor = new KpsdkExtractor(asPage(page), 'FR')
		extractor.attach()

		// Emit a request where headers() throws
		assert.doesNotThrow(() => {
			page.emit({
				url: () => 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM',
				headers: () => {
					throw new Error('headers() failed')
				},
			})
		})
	})

	it('timestamp is updated on every new capture', async () => {
		const page = makeFakePage()
		const extractor = new KpsdkExtractor(asPage(page), 'FR')
		extractor.attach()

		page.emit({
			url: () => 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM',
			headers: () => ({ 'x-kpsdk-ct': 'ct-1', 'x-kpsdk-v': 'v-1' }),
		})

		const first = await extractor.getToken()
		assert.ok(first !== null)
		const firstTs = first.capturedAt.getTime()

		// Small pause to ensure timestamp difference
		await new Promise((r) => setTimeout(r, 5))

		page.emit({
			url: () => 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM',
			headers: () => ({ 'x-kpsdk-ct': 'ct-2', 'x-kpsdk-v': 'v-2' }),
		})

		const second = await extractor.getToken()
		assert.ok(second !== null)
		assert.ok(second.capturedAt.getTime() >= firstTs, 'timestamp should be updated')
		assert.equal(second.ct, 'ct-2')
	})
})
