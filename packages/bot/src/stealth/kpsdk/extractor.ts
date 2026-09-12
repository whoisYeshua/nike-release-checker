import type { Page, Request } from 'playwright'
import { isProtectedUrl, type KpsdkToken } from './types.js'

export class KpsdkExtractor {
	private current: KpsdkToken | null = null
	private listener: ((req: Request) => void) | null = null
	private page: Page
	private country: string

	constructor(page: Page, country: string) {
		this.page = page
		this.country = country
	}

	attach(): void {
		if (this.listener) return
		this.listener = (request) => {
			try {
				if (!isProtectedUrl(request.url())) return
				const headers = request.headers()
				const ct = headers['x-kpsdk-ct']
				const v = headers['x-kpsdk-v']
				if (!ct || !v) return
				this.current = { ct, v, capturedAt: new Date(), source: 'request' }
			} catch (e) {
				// Never throw into Playwright event loop
				console.error('kpsdk extractor capture failed:', (e as Error).message)
			}
		}
		this.page.on('request', this.listener)
	}

	detach(): void {
		if (this.listener) {
			this.page.off('request', this.listener)
			this.listener = null
		}
	}

	async getToken(): Promise<KpsdkToken | null> {
		if (this.current) return this.current
		await this.forceFireProtectedRequest()
		return this.current
	}

	private async forceFireProtectedRequest(): Promise<void> {
		const url = `https://api.nike.com/buy/carts/v2/${this.country}/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY`
		try {
			await this.page.request.fetch(url, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json-patch+json' },
				data: JSON.stringify([
					{ op: 'merge', path: '/', value: { visitorId: crypto.randomUUID() } },
				]),
			})
		} catch {
			// Even on failure, the request fired and the listener captured the token
		}
	}
}

// WeakMap<Page> ensures GC when the page closes; no manual cleanup required by callers.
const extractors = new WeakMap<Page, KpsdkExtractor>()

export function getKpsdkExtractor(page: Page, country: string): KpsdkExtractor {
	let extractor = extractors.get(page)
	if (!extractor) {
		extractor = new KpsdkExtractor(page, country)
		extractor.attach()
		extractors.set(page, extractor)
	}
	return extractor
}
