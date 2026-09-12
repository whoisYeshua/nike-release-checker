/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { Box } from 'ink'
import { useAnimations } from '../AnimationsContext.tsx'

export interface FadeHighlightProps {
	children: ReactNode
	triggerKey: string | number
	color?: 'green' | 'red' | 'yellow'
	durationMs?: number
}

export const FadeHighlight: FC<FadeHighlightProps> = ({
	children,
	triggerKey,
	color = 'green',
	durationMs = 500,
}) => {
	const { enabled } = useAnimations()
	const [active, setActive] = useState(false)
	useEffect(() => {
		if (!enabled) return
		setActive(true)
		const t = setTimeout(() => setActive(false), durationMs)
		return () => clearTimeout(t)
	}, [triggerKey, enabled, durationMs])
	return (
		<Box>
			{active ? <Box backgroundColor={color}>{children}</Box> : <Box>{children}</Box>}
		</Box>
	)
}
