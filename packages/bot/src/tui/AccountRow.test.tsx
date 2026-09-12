/** @jsxImportSource react */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from 'ink-testing-library'
import { AccountRow } from './AccountRow.tsx'

/** Strip ANSI escape sequences from a string */
function stripAnsi(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1B\[[0-9;]*m/g, '')
}

/** Get the visible width of a string (after stripping ANSI codes) */
function visibleWidth(str: string): number {
	return stripAnsi(str).length
}

test('AccountRow: renders without crashing for pending status', () => {
	const ui = render(
		<AccountRow
			accountId='test-account'
			status={{ kind: 'pending' }}
			elapsedMs={0}
		/>,
	)
	const out = ui.lastFrame() ?? ''
	assert.ok(out.length > 0, 'should render something')
	ui.unmount()
})

test('AccountRow: truncates accountId longer than 16 chars with ellipsis', () => {
	const longId = 'really-long-account-name-that-exceeds-16'
	const ui = render(
		<AccountRow
			accountId={longId}
			status={{ kind: 'pending' }}
			elapsedMs={0}
		/>,
	)
	const out = stripAnsi(ui.lastFrame() ?? '')
	// The full id should not appear; truncated version should be present
	assert.ok(!out.includes(longId), 'full id should not appear in output')
	assert.ok(out.includes('…'), 'ellipsis should be present')
	ui.unmount()
})

test('AccountRow NFR27: no rendered line exceeds 80 visible chars (80-column layout)', () => {
	// Simulate 80-column terminal
	const origColumns = process.stdout.columns
	Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true })

	const ui = render(
		<AccountRow
			accountId='really-long-account-name-that-exceeds-16'
			status={{ kind: 'waiting', step: 'addToCart' }}
			elapsedMs={12345}
		/>,
	)

	const out = ui.lastFrame() ?? ''
	const lines = out.split('\n')
	for (const line of lines) {
		const w = visibleWidth(line)
		assert.ok(
			w <= 80,
			`line width ${w} exceeds 80: "${stripAnsi(line)}"`,
		)
	}

	Object.defineProperty(process.stdout, 'columns', { value: origColumns, configurable: true })
	ui.unmount()
})

test('AccountRow NFR27: details column truncated when very long', () => {
	const ui = render(
		<AccountRow
			accountId='acc'
			status={{ kind: 'cop', size: '42', orderNumber: 'x'.repeat(200) }}
			elapsedMs={1000}
		/>,
	)
	const out = stripAnsi(ui.lastFrame() ?? '')
	const lines = out.split('\n')
	// At least one line should render (the component didn't crash)
	assert.ok(lines.length > 0)
	// The 200-char order number should not appear verbatim
	assert.ok(!out.includes('x'.repeat(200)), 'raw 200-char detail should be truncated')
	ui.unmount()
})

test('AccountRow: COP status shows green check icon', () => {
	const ui = render(
		<AccountRow
			accountId='acc-1'
			status={{ kind: 'cop', size: '42' }}
			elapsedMs={5000}
		/>,
	)
	const out = ui.lastFrame() ?? ''
	assert.match(out, /✓/, 'COP icon should be ✓')
	ui.unmount()
})

test('AccountRow: FAIL status shows red X icon', () => {
	const ui = render(
		<AccountRow
			accountId='acc-1'
			status={{ kind: 'fail', reason: 'SOLD_OUT' }}
			elapsedMs={3000}
		/>,
	)
	const out = ui.lastFrame() ?? ''
	assert.match(out, /✗/, 'FAIL icon should be ✗')
	ui.unmount()
})
