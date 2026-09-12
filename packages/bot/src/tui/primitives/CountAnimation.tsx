/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { Text } from 'ink'
import { useAnimations } from '../AnimationsContext.tsx'

export interface CountAnimationProps {
	value: number
	color?: string
}

export const CountAnimation: FC<CountAnimationProps> = ({ value, color }) => {
	const { enabled } = useAnimations()
	const [flash, setFlash] = useState(false)
	const prev = useRef(value)
	useEffect(() => {
		if (!enabled) {
			prev.current = value
			return
		}
		if (prev.current !== value) {
			setFlash(true)
			const t = setTimeout(() => setFlash(false), 300)
			prev.current = value
			return () => clearTimeout(t)
		}
	}, [value, enabled])
	return (
		<Text bold={flash} color={color}>
			{value}
		</Text>
	)
}
