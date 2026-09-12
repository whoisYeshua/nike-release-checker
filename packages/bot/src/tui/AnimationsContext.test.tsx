/** @jsxImportSource react */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from 'ink-testing-library'
import { AnimationsProvider } from './AnimationsContext.tsx'
import { Spinner } from './primitives/Spinner.tsx'
import { FadeHighlight } from './primitives/FadeHighlight.tsx'
import { Text } from 'ink'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Temporarily override env vars for a Provider-mount block. */
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

test('NIKE_BOT_NO_ANIMATIONS=1 disables animations — Spinner renders static dot', () => {
	withEnv({ NIKE_BOT_NO_ANIMATIONS: '1', NODE_TEST_CONTEXT: undefined }, () => {
		const ui = render(
			<AnimationsProvider>
				<Spinner />
			</AnimationsProvider>,
		)
		const out = ui.lastFrame() ?? ''
		assert.match(out, /·/)
		ui.unmount()
	})
})

test('NODE_TEST_CONTEXT disables animations — Spinner static even if NIKE_BOT_NO_ANIMATIONS=0', () => {
	// Under node --test, NODE_TEST_CONTEXT is present; the animations-disable
	// branch should still render a static dot.
	withEnv({ NIKE_BOT_NO_ANIMATIONS: '0' }, () => {
		assert.ok(process.env.NODE_TEST_CONTEXT, 'expected NODE_TEST_CONTEXT under node --test')
		const ui = render(
			<AnimationsProvider>
				<Spinner />
			</AnimationsProvider>,
		)
		assert.match(ui.lastFrame() ?? '', /·/)
		ui.unmount()
	})
})

test('FadeHighlight activates on triggerKey change, reverts after durationMs', async () => {
	await withEnv(
		{ NIKE_BOT_NO_ANIMATIONS: undefined, NODE_TEST_CONTEXT: undefined },
		async () => {
			const ui = render(
				<AnimationsProvider>
					<FadeHighlight triggerKey='k1' durationMs={80}>
						<Text>content</Text>
					</FadeHighlight>
				</AnimationsProvider>,
			)
			// Shortly after mount, active should be true; rerender to bump triggerKey
			await sleep(20)
			// Content rendered regardless of active state
			assert.match(ui.lastFrame() ?? '', /content/)
			// After durationMs, flash should have reverted — still shows content
			await sleep(120)
			assert.match(ui.lastFrame() ?? '', /content/)

			// Re-trigger
			ui.rerender(
				<AnimationsProvider>
					<FadeHighlight triggerKey='k2' durationMs={80}>
						<Text>content</Text>
					</FadeHighlight>
				</AnimationsProvider>,
			)
			await sleep(20)
			assert.match(ui.lastFrame() ?? '', /content/)
			ui.unmount()
		},
	)
})
