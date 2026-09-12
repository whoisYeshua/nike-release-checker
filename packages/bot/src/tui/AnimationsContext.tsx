/** @jsxImportSource react */
import { createContext, useContext, useMemo } from 'react'
import type { FC, ReactNode } from 'react'

interface AnimationsValue {
	enabled: boolean
}

const AnimationsCtx = createContext<AnimationsValue>({ enabled: true })

export const AnimationsProvider: FC<{ children: ReactNode }> = ({ children }) => {
	// Env vars evaluated ONCE at Provider mount (stable during run)
	const value = useMemo<AnimationsValue>(
		() => ({
			enabled:
				process.env.NIKE_BOT_NO_ANIMATIONS !== '1' &&
				!process.env.NODE_TEST_CONTEXT,
		}),
		[],
	)
	return <AnimationsCtx.Provider value={value}>{children}</AnimationsCtx.Provider>
}

export function useAnimations(): AnimationsValue {
	return useContext(AnimationsCtx)
}
