/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { Box, Text, render } from 'ink'
import { installChromium, isChromiumInstalled } from '../installer/chromiumInstaller.ts'

function maskCredentials(s: string): string {
	return s.replace(/([a-zA-Z0-9+/_-]+):([^@\s]+)@/g, '***:***@')
}

interface WidgetProps {
	onDone: () => void
	onError: (err: Error) => void
}

function ProgressBar({ percent }: { percent: number }) {
	const width = 30
	const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
	const empty = width - filled
	return <Text>[{'█'.repeat(filled)}{'░'.repeat(empty)}] {percent}%</Text>
}

function InstallWidget({ onDone, onError }: WidgetProps) {
	const [phase, setPhase] = useState<string>('download')
	const [percent, setPercent] = useState<number>(0)
	const [errorMsg, setErrorMsg] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		installChromium({
			onProgress: (e) => {
				if (cancelled) return
				setPhase(e.phase)
				setPercent(e.percent)
			},
		})
			.then(() => {
				if (!cancelled) onDone()
			})
			.catch((err: Error) => {
				if (cancelled) return
				const masked = maskCredentials(err.message || 'unknown error')
				setErrorMsg(masked)
				onError(new Error(masked))
			})
		return () => {
			cancelled = true
		}
	}, [onDone, onError])

	if (errorMsg) {
		const is407 = /\b407\b|proxy authentication/i.test(errorMsg)
		return (
			<Box flexDirection="column">
				<Text color="red">Chromium install failed: {errorMsg}</Text>
				<Text>Unable to download browser. Options:</Text>
				<Text>  1) check internet</Text>
				<Text>  2) run `nike-bot install-browser --proxy &lt;url&gt;`</Text>
				<Text>  3) install manually via `npx playwright install chromium`</Text>
				{is407 ? (
					<Text color="yellow">Proxy authentication required — try `--proxy http://user:pass@host:port`</Text>
				) : null}
			</Box>
		)
	}

	return (
		<Box flexDirection="column">
			<Text>Installing Chromium (one-time, ~150MB)</Text>
			<Box>
				<Text>{phase}: </Text>
				<ProgressBar percent={percent} />
			</Box>
		</Box>
	)
}

export async function ensureChromium(): Promise<void> {
	if (isChromiumInstalled()) return

	return new Promise<void>((resolve, reject) => {
		let settled = false
		const instance = render(
			<InstallWidget
				onDone={() => {
					if (settled) return
					settled = true
					instance.unmount()
					resolve()
				}}
				onError={(err) => {
					if (settled) return
					settled = true
					// leave final error visible briefly then unmount
					setTimeout(() => {
						instance.unmount()
						reject(err)
					}, 50)
				}}
			/>,
		)
	})
}
