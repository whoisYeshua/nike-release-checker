// Unit tests for persistReceipt (Story 12.8)
// Covers: path construction, file permissions, PII exclusion, filename collision.
// Pattern: node:test + node:assert, ESM, tabs.

import { describe, it, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { persistReceipt } from './receiptStore.ts'
import type { CheckoutResponse } from './checkoutsApi.types.ts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const confirmedResp: CheckoutResponse = {
	orderNumber: 'ORD-2024-001',
	orderId: 'order-id-001',
	status: 'CONFIRMED',
	totalAmount: 110.00,
	currency: 'EUR',
	etaWindow: { earliest: '2024-01-10', latest: '2024-01-12' },
	receiptUrl: 'https://nike.com/orders/ORD-2024-001',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a unique temp directory for one test to avoid cross-test pollution. */
const makeTmpRoot = () => join(tmpdir(), `receipt-test-${randomUUID()}`)

// Track roots to clean up after all tests.
const roots: string[] = []

after(async () => {
	await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
})

// ─── Path construction ────────────────────────────────────────────────────────

describe('persistReceipt — path construction', () => {
	it('writes to <root>/.bot-data/receipts/<accountId>-<orderNumber>.json', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const path = await persistReceipt(root, 'user123', 'cart-001', confirmedResp)

		assert.equal(path, join(root, '.bot-data', 'receipts', 'user123-ORD-2024-001.json'))
	})

	it('sanitises accountId containing @ and .', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const path = await persistReceipt(root, 'user@example.com', 'cart-001', confirmedResp)

		assert.ok(path.includes('user_example_com'), `Expected sanitised path, got ${path}`)
	})

	it('creates intermediate directories recursively', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const path = await persistReceipt(root, 'acct1', 'cart-001', confirmedResp)

		const s = await stat(path)
		assert.ok(s.isFile())
	})
})

// ─── File content ─────────────────────────────────────────────────────────────

describe('persistReceipt — file content', () => {
	it('written JSON contains orderNumber, orderId, status, totalAmount, currency', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const path = await persistReceipt(root, 'acct1', 'cart-001', confirmedResp)
		const raw = await readFile(path, 'utf-8')
		const parsed = JSON.parse(raw)

		assert.equal(parsed.orderNumber, 'ORD-2024-001')
		assert.equal(parsed.orderId, 'order-id-001')
		assert.equal(parsed.status, 'CONFIRMED')
		assert.equal(parsed.totalAmount, 110.00)
		assert.equal(parsed.currency, 'EUR')
	})

	it('written JSON contains accountId and cartId', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const path = await persistReceipt(root, 'acct1', 'cart-001', confirmedResp)
		const raw = await readFile(path, 'utf-8')
		const parsed = JSON.parse(raw)

		assert.equal(parsed.accountId, 'acct1')
		assert.equal(parsed.cartId, 'cart-001')
	})

	it('written JSON contains capturedAt ISO timestamp', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const path = await persistReceipt(root, 'acct1', 'cart-001', confirmedResp)
		const raw = await readFile(path, 'utf-8')
		const parsed = JSON.parse(raw)

		assert.ok(typeof parsed.capturedAt === 'string')
		assert.doesNotThrow(() => new Date(parsed.capturedAt))
		assert.ok(!isNaN(new Date(parsed.capturedAt).getTime()))
	})

	it('written JSON contains etaWindow and receiptUrl', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const path = await persistReceipt(root, 'acct1', 'cart-001', confirmedResp)
		const raw = await readFile(path, 'utf-8')
		const parsed = JSON.parse(raw)

		assert.deepEqual(parsed.etaWindow, { earliest: '2024-01-10', latest: '2024-01-12' })
		assert.equal(parsed.receiptUrl, 'https://nike.com/orders/ORD-2024-001')
	})
})

// ─── PII exclusion ────────────────────────────────────────────────────────────

describe('persistReceipt — PII exclusion', () => {
	it('does NOT include address field', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const resp: CheckoutResponse & { address?: string } = { ...confirmedResp, address: '1 Rue de la Paix' }
		const path = await persistReceipt(root, 'acct1', 'cart-001', resp as CheckoutResponse)
		const raw = await readFile(path, 'utf-8')
		const parsed = JSON.parse(raw)

		assert.ok(!('address' in parsed), 'Receipt must NOT contain address')
		assert.ok(!raw.includes('Rue de la Paix'), 'Raw JSON must NOT contain street address')
	})

	it('does NOT include card last4 field', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const resp: CheckoutResponse & { cardLast4?: string } = { ...confirmedResp, cardLast4: '1234' }
		const path = await persistReceipt(root, 'acct1', 'cart-001', resp as CheckoutResponse)
		const raw = await readFile(path, 'utf-8')
		const parsed = JSON.parse(raw)

		assert.ok(!('cardLast4' in parsed), 'Receipt must NOT contain cardLast4')
	})
})

// ─── Filename collision ───────────────────────────────────────────────────────

describe('persistReceipt — filename collision', () => {
	it('same accountId + orderNumber → second write overwrites cleanly', async () => {
		const root = makeTmpRoot()
		roots.push(root)

		const first = await persistReceipt(root, 'acct1', 'cart-001', confirmedResp)
		const second = await persistReceipt(root, 'acct1', 'cart-002', confirmedResp)

		// Both paths should be the same (same accountId + orderNumber)
		assert.equal(first, second)

		// The second write should contain cartId 'cart-002'
		const raw = await readFile(second, 'utf-8')
		const parsed = JSON.parse(raw)
		assert.equal(parsed.cartId, 'cart-002')
	})
})
