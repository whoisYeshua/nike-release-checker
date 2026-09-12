/** @jsxImportSource react */
import { useCallback, useState } from 'react'
import { Box, Text, render, useApp } from 'ink'
import { Step1AccountCount } from './Step1AccountCount.tsx'
import { Step2CsvPaths, type CsvPaths } from './Step2CsvPaths.tsx'
import { Step3SessionCapture, type Step3Result } from './Step3SessionCapture.tsx'
import { Step4DryRun, type Step4Result } from './Step4DryRun.tsx'
import { StepSummary } from './StepSummary.tsx'

type StepName = 'count' | 'paths' | 'capture' | 'dryRun' | 'summary'

interface WizardState {
	step: StepName
	accountCount?: number
	csvPaths?: CsvPaths
	captureResult?: Step3Result
	dryRunResult?: Step4Result
}

export function Wizard() {
	const { exit } = useApp()
	const [state, setState] = useState<WizardState>({ step: 'count' })

	const handleCount = useCallback((count: number) => {
		setState((s) => ({ ...s, accountCount: count, step: 'paths' }))
	}, [])

	const handlePaths = useCallback((paths: CsvPaths) => {
		setState((s) => ({ ...s, csvPaths: paths, step: 'capture' }))
	}, [])

	const handleCapture = useCallback((result: Step3Result) => {
		setState((s) => ({ ...s, captureResult: result, step: 'dryRun' }))
	}, [])

	const handleDryRun = useCallback((result: Step4Result) => {
		setState((s) => ({ ...s, dryRunResult: result, step: 'summary' }))
	}, [])

	const handleExit = useCallback(() => {
		exit()
	}, [exit])

	return (
		<Box flexDirection='column'>
			<Text color='magenta'>nike-bot init — interactive setup wizard</Text>
			{state.step === 'count' ? <Step1AccountCount onDone={handleCount} /> : null}
			{state.step === 'paths' ? <Step2CsvPaths onDone={handlePaths} /> : null}
			{state.step === 'capture' && state.csvPaths ? (
				<Step3SessionCapture accountsCsvPath={state.csvPaths.accounts} onDone={handleCapture} />
			) : null}
			{state.step === 'dryRun' && state.csvPaths ? (
				<Step4DryRun accountsCsvPath={state.csvPaths.accounts} onDone={handleDryRun} />
			) : null}
			{state.step === 'summary' && state.captureResult && state.dryRunResult ? (
				<StepSummary
					authenticated={state.captureResult.authenticated}
					failed={state.captureResult.failed}
					dryRunSuccess={state.dryRunResult.success}
					dryRunSkipped={state.dryRunResult.skipped}
					onExit={handleExit}
				/>
			) : null}
		</Box>
	)
}

export async function runInitWizard(): Promise<void> {
	const app = render(<Wizard />)
	// Await the wizard's exit so callers (e.g. the home-menu loop) resume only
	// after setup completes, not the instant the component mounts.
	await app.waitUntilExit()
}
