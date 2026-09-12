/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Text } from 'ink'
import { useAnimations } from '../AnimationsContext.tsx'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export const Spinner: FC<{ intervalMs?: number }> = ({ intervalMs = 100 }) => {
	const { enabled } = useAnimations()
	const [idx, setIdx] = useState(0)
	useEffect(() => {
		if (!enabled) return
		const t = setInterval(() => setIdx((i) => (i + 1) % FRAMES.length), intervalMs)
		return () => clearInterval(t)
	}, [enabled, intervalMs])
	return <Text>{enabled ? FRAMES[idx] : '·'}</Text>
}
