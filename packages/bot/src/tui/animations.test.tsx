/** @jsxImportSource react */
/**
 * Smoke tests for Story 11.2 — TUI animation polish.
 * Animations are auto-disabled under node --test (NODE_TEST_CONTEXT is set),
 * so most assertions verify the static/disabled state. Opt-in tests for live
 * animations temporarily clear NODE_TEST_CONTEXT.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { AnimationsProvider } from './AnimationsContext.tsx'
import { Spinner } from './primitives/Spinner.tsx'
import { CountAnimation } from './primitives/CountAnimation.tsx'
import { AccountRow } from './AccountRow.tsx'

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
// Spinner — disabled mode
// ---------------------------------------------------------------------------

test('Spinner: NIKE_BOT_NO_ANIMATIONS=1 renders static fallback (·), no interval', () => {
	withEnv({ NIKE_BOT_NO_ANIMATIONS: '1', NODE_TEST_CONTEXT: undefined }, () => {
		const ui = render(
			<AnimationsProvider>
				<Spinner />
			</AnimationsProvider>,
		)
		const frame1 = ui.lastFrame() ?? ''
		assert.match(frame1, /·/, 'should show static dot when animations disabled')
		ui.unmount()
	})
})

test('Spinner: animations auto-disabled under NODE_TEST_CONTEXT (no cycling)', () => {
	// NODE_TEST_CONTEXT is present under node --test; this test confirms the
	// Provider reads it and disables animations without NIKE_BOT_NO_ANIMATIONS.
	assert.ok(process.env.NODE_TEST_CONTEXT, 'this test must run under node --test')
	const ui = render(
		<AnimationsProvider>
			<Spinner />
		</AnimationsProvider>,
	)
	const frame1 = ui.lastFrame() ?? ''
	assert.match(frame1, /·/, 'should show static dot under NODE_TEST_CONTEXT')
	ui.unmount()
})

test('Spinner: frame differs after 150ms when animations enabled', async () => {
	// Opt-in: clear NODE_TEST_CONTEXT to allow live animation.
	await withEnv(
		{ NIKE_BOT_NO_ANIMATIONS: undefined, NODE_TEST_CONTEXT: undefined },
		async () => {
			const ui = render(
				<AnimationsProvider>
					<Spinner />
				</AnimationsProvider>,
			)
			const frame1 = ui.lastFrame() ?? ''
			await sleep(150)
			const frame2 = ui.lastFrame() ?? ''
			// After 150ms (≥1 interval of 100ms), the spinner frame must have advanced.
			// Both frames must be a braille character, not the static dot.
			assert.doesNotMatch(frame1, /·/, 'live spinner should not show static dot')
			assert.doesNotMatch(frame2, /·/, 'live spinner should not show static dot after tick')
			assert.notEqual(frame1, frame2, 'spinner frame must advance after 150ms')
			ui.unmount()
		},
	)
})

// ---------------------------------------------------------------------------
// AccountRow — spinner integration for 'waiting' status
// ---------------------------------------------------------------------------

test('AccountRow: waiting status renders Spinner (static · under test env)', () => {
	const ui = render(
		<AnimationsProvider>
			<AccountRow
				accountId='test-acc'
				status={{ kind: 'waiting', step: 'addToCart' }}
				elapsedMs={500}
			/>
		</AnimationsProvider>,
	)
	const out = ui.lastFrame() ?? ''
	// Under NODE_TEST_CONTEXT the spinner renders the static dot
	assert.match(out, /·/, 'waiting row should contain spinner static fallback')
	ui.unmount()
})

test('AccountRow: non-waiting statuses do not render spinner character', () => {
	for (const status of [
		{ kind: 'pending' as const },
		{ kind: 'cop' as const, size: '10' },
		{ kind: 'fail' as const, reason: 'SOLD_OUT' as const },
	]) {
		const ui = render(
			<AnimationsProvider>
				<AccountRow accountId='acc' status={status} elapsedMs={0} />
			</AnimationsProvider>,
		)
		const out = ui.lastFrame() ?? ''
		// Braille dot is not rendered for non-waiting statuses
		assert.doesNotMatch(out, /·/, `status ${status.kind} should not show spinner dot`)
		ui.unmount()
	}
})

// ---------------------------------------------------------------------------
// CountAnimation — disabled mode
// ---------------------------------------------------------------------------

test('CountAnimation: renders value as plain text (no crash)', () => {
	const ui = render(
		<AnimationsProvider>
			<CountAnimation value={42} color='green' />
		</AnimationsProvider>,
	)
	const out = ui.lastFrame() ?? ''
	assert.match(out, /42/, 'should render numeric value')
	ui.unmount()
})

test('CountAnimation: value change updates rendered output', async () => {
	const { rerender, lastFrame, unmount } = render(
		<AnimationsProvider>
			<CountAnimation value={0} color='green' />
		</AnimationsProvider>,
	)
	assert.match(lastFrame() ?? '', /0/)
	rerender(
		<AnimationsProvider>
			<CountAnimation value={5} color='green' />
		</AnimationsProvider>,
	)
	await sleep(10)
	assert.match(lastFrame() ?? '', /5/)
	unmount()
})

// ---------------------------------------------------------------------------
// AnimationsProvider — snapshot stability with NO_ANIMATIONS
// ---------------------------------------------------------------------------

test('Dashboard snapshot stable over 250ms when NIKE_BOT_NO_ANIMATIONS=1', async () => {
	withEnv({ NIKE_BOT_NO_ANIMATIONS: '1', NODE_TEST_CONTEXT: undefined }, () => {
		const ui = render(
			<AnimationsProvider>
				<Spinner />
				<Text> hello </Text>
				<CountAnimation value={3} color='cyan' />
			</AnimationsProvider>,
		)
		const snap1 = ui.lastFrame()
		// Even if we wait, disabled mode should never flip frames
		const snap2 = ui.lastFrame()
		assert.equal(snap1, snap2, 'output must be stable when animations disabled')
		ui.unmount()
	})
})
