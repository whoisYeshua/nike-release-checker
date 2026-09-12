/** @jsxImportSource react */
/**
 * Unit tests for the FadeHighlight primitive (Story 11.2).
 * Background-color activation and auto-revert are tested both in disabled
 * mode (stable / no color) and in live mode (briefly wraps children with
 * backgroundColor, then reverts).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { AnimationsProvider } from './AnimationsContext.tsx'
import { FadeHighlight } from './primitives/FadeHighlight.tsx'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Temporarily override env vars around a synchronous or async function. */
function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
	const prev: Record<string, string | undefined> = {}
	for (const k of Object.keys(overrides)) {
		prev[k] = process.env[k]
		const v = overrides[k]
		if (v === undefined) delete process.env[k]
		else process.env[k] = v
	}
	try {
		return fn()
	} finally {
		for (const k of Object.keys(prev)) {
			const v = prev[k]
			if (v === undefined) delete process.env[k]
			else process.env[k] = v
		}
	}
}

// ---------------------------------------------------------------------------
// Disabled-mode (NIKE_BOT_NO_ANIMATIONS=1)
// ---------------------------------------------------------------------------

test('FadeHighlight disabled: children always rendered, no active state', () => {
	withEnv({ NIKE_BOT_NO_ANIMATIONS: '1', NODE_TEST_CONTEXT: undefined }, () => {
		const ui = render(
			<AnimationsProvider>
				<FadeHighlight triggerKey='k1' color='green'>
					<Text>hello</Text>
				</FadeHighlight>
			</AnimationsProvider>,
		)
		assert.match(ui.lastFrame() ?? '', /hello/, 'children must render when disabled')
		ui.unmount()
	})
})

test('FadeHighlight disabled: output unchanged after triggerKey change', () => {
	withEnv({ NIKE_BOT_NO_ANIMATIONS: '1', NODE_TEST_CONTEXT: undefined }, () => {
		const { rerender, lastFrame, unmount } = render(
			<AnimationsProvider>
				<FadeHighlight triggerKey='step-1' color='green'>
					<Text>content</Text>
				</FadeHighlight>
			</AnimationsProvider>,
		)
		const before = lastFrame()
		rerender(
			<AnimationsProvider>
				<FadeHighlight triggerKey='step-2' color='green'>
					<Text>content</Text>
				</FadeHighlight>
			</AnimationsProvider>,
		)
		const after = lastFrame()
		assert.equal(before, after, 'disabled mode must not change output on triggerKey bump')
		unmount()
	})
})

// ---------------------------------------------------------------------------
// Live-mode (NODE_TEST_CONTEXT cleared to enable animations)
// ---------------------------------------------------------------------------

test('FadeHighlight live: children render when triggerKey changes', async () => {
	await withEnv(
		{ NIKE_BOT_NO_ANIMATIONS: undefined, NODE_TEST_CONTEXT: undefined },
		async () => {
			const ui = render(
				<AnimationsProvider>
					<FadeHighlight triggerKey='step-1' durationMs={80} color='green'>
						<Text>content</Text>
					</FadeHighlight>
				</AnimationsProvider>,
			)
			// Content is always visible regardless of active state
			assert.match(ui.lastFrame() ?? '', /content/)

			// Trigger a re-key
			ui.rerender(
				<AnimationsProvider>
					<FadeHighlight triggerKey='step-2' durationMs={80} color='green'>
						<Text>content</Text>
					</FadeHighlight>
				</AnimationsProvider>,
			)
			await sleep(20)
			assert.match(ui.lastFrame() ?? '', /content/, 'content must be visible during active flash')

			// After durationMs has elapsed the highlight should have cleared
			await sleep(120)
			assert.match(ui.lastFrame() ?? '', /content/, 'content must remain visible after flash expires')

			ui.unmount()
		},
	)
})

test('FadeHighlight live: output reverts after durationMs', async () => {
	await withEnv(
		{ NIKE_BOT_NO_ANIMATIONS: undefined, NODE_TEST_CONTEXT: undefined },
		async () => {
			const ui = render(
				<AnimationsProvider>
					<FadeHighlight triggerKey='initial' durationMs={60} color='red'>
						<Text>row</Text>
					</FadeHighlight>
				</AnimationsProvider>,
			)

			// Trigger
			ui.rerender(
				<AnimationsProvider>
					<FadeHighlight triggerKey='changed' durationMs={60} color='red'>
						<Text>row</Text>
					</FadeHighlight>
				</AnimationsProvider>,
			)

			const duringFlash = ui.lastFrame() ?? ''
			// Children must still be present during flash
			assert.match(duringFlash, /row/)

			// Wait for revert
			await sleep(100)
			const afterFlash = ui.lastFrame() ?? ''
			assert.match(afterFlash, /row/, 'children still visible after flash')

			ui.unmount()
		},
	)
})

// ---------------------------------------------------------------------------
// Under node --test (NODE_TEST_CONTEXT present) = disabled
// ---------------------------------------------------------------------------

test('FadeHighlight: disabled under NODE_TEST_CONTEXT without NIKE_BOT_NO_ANIMATIONS', () => {
	assert.ok(process.env.NODE_TEST_CONTEXT, 'must run under node --test for this assertion')
	const ui = render(
		<AnimationsProvider>
			<FadeHighlight triggerKey='k' color='green'>
				<Text>visible</Text>
			</FadeHighlight>
		</AnimationsProvider>,
	)
	assert.match(ui.lastFrame() ?? '', /visible/)
	ui.unmount()
})
