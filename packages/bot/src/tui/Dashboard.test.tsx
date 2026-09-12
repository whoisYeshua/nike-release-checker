/** @jsxImportSource react */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from 'ink-testing-library'
import { Dashboard } from './Dashboard.tsx'
import { globalBus } from './eventBus.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('dashboard renders 3 account rows with sku and ids', () => {
	const ui = render(
		<Dashboard
			sku='AH7389-106'
			sizes={['42']}
			accountIds={['a', 'b', 'c']}
			onFinished={() => {}}
		/>,
	)
	const out = ui.lastFrame() ?? ''
	assert.match(out, /AH7389-106/)
	assert.match(out, /a /)
	assert.match(out, /b /)
	assert.match(out, /c /)
	ui.unmount()
})

test('status update re-renders row to COP', async () => {
	const ui = render(
		<Dashboard sku='X' sizes={['42']} accountIds={['a']} onFinished={() => {}} />,
	)
	globalBus.emit('accountStatusChanged', {
		accountId: 'a',
		status: { kind: 'cop', size: '42', orderNumber: 'OR-1' },
	})
	await sleep(50)
	assert.match(ui.lastFrame() ?? '', /COP/)
	ui.unmount()
})

test('render rate ≥ 2 FPS for 10 accounts', async () => {
	const ids = Array.from({ length: 10 }, (_, i) => `acc_${i}`)
	const ui = render(
		<Dashboard sku='X' sizes={['42']} accountIds={ids} onFinished={() => {}} />,
	)
	const start = performance.now()
	let frames = 0
	const timer = setInterval(() => {
		if (ui.lastFrame()) frames++
	}, 100)
	for (let i = 0; i < 10; i++) {
		globalBus.emit('accountStatusChanged', {
			accountId: `acc_${i}`,
			status: { kind: 'waiting', step: 'step-' + i },
		})
		await sleep(50)
	}
	await sleep(500)
	clearInterval(timer)
	const fps = frames / ((performance.now() - start) / 1000)
	assert.ok(fps >= 2, `expected ≥ 2 FPS, got ${fps}`)
	console.log(`measured ${fps.toFixed(2)} FPS over ${frames} frames`)
	ui.unmount()
})
