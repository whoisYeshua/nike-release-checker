import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { toCheckoutResult } from './checkoutResultAdapter.ts'
import type { CheckoutPipelineResult } from './checkoutPipeline.ts'
import type { StepResult } from './executeStep.ts'

const SKU = 'IQ7604-101'

function mkResult(
	overrides: Partial<CheckoutPipelineResult> = {},
): CheckoutPipelineResult {
	return {
		accountId: 'a1',
		accountEmail: 'a***@x.com',
		steps: [],
		finalOutcome: 'success',
		durationMs: 1234,
		...overrides,
	}
}

const sizeStep = (size = '42'): StepResult => ({
	step: 'select-size',
	outcome: 'success',
	durationMs: 50,
	details: `size:${size}`,
})

describe('toCheckoutResult', () => {
	it('maps success → COP and extracts size from select-size details', () => {
		const r = toCheckoutResult(
			mkResult({ steps: [sizeStep('42')], finalOutcome: 'success' }),
			SKU,
		)
		assert.equal(r.status, 'COP')
		assert.equal(r.size, '42')
		assert.equal(r.sku, SKU)
		assert.equal(r.accountId, 'a1')
		assert.equal(r.errorReason, undefined)
		assert.equal(r.durationMs, 1234)
		assert.equal(r.name, undefined) // no name passed
	})

	it('propagates the optional pair name to the report row', () => {
		const r = toCheckoutResult(
			mkResult({ steps: [sizeStep('42')], finalOutcome: 'success' }),
			SKU,
			'Kobe Mambacita',
		)
		assert.equal(r.name, 'Kobe Mambacita')
	})

	it('maps sold_out → SOLD_OUT and uses failed step details/error as errorReason', () => {
		const failed: StepResult = {
			step: 'select-size',
			outcome: 'sold_out',
			durationMs: 80,
			error: 'No size available from: 42, 43',
		}
		const r = toCheckoutResult(
			mkResult({ steps: [failed], finalOutcome: 'sold_out' }),
			SKU,
		)
		assert.equal(r.status, 'SOLD_OUT')
		assert.equal(r.size, undefined)
		assert.equal(r.errorReason, 'No size available from: 42, 43')
	})

	it('maps 3ds_timeout → THREEDS_TIMEOUT and preserves earlier-step size', () => {
		const r = toCheckoutResult(
			mkResult({
				steps: [
					sizeStep('41.5'),
					{
						step: '3ds-validation',
						outcome: '3ds_timeout',
						durationMs: 60_000,
						error: '3DS timed out',
					},
				],
				finalOutcome: '3ds_timeout',
			}),
			SKU,
		)
		assert.equal(r.status, 'THREEDS_TIMEOUT')
		assert.equal(r.size, '41.5')
		assert.equal(r.errorReason, '3DS timed out')
	})

	it('falls back to ERROR for unknown outcomes and surfaces no session as NO_SESSION', () => {
		const noSession = toCheckoutResult(
			mkResult({ steps: [], finalOutcome: 'no_session' }),
			SKU,
		)
		assert.equal(noSession.status, 'NO_SESSION')

		const weird = toCheckoutResult(
			// Cast to feed the adapter an outcome it does not know about.
			mkResult({ finalOutcome: 'gibberish' as unknown as CheckoutPipelineResult['finalOutcome'] }),
			SKU,
		)
		assert.equal(weird.status, 'ERROR')
		// errorReason should fall back to finalOutcome string when no failed step exists
		assert.equal(weird.errorReason, 'gibberish')
	})
})
