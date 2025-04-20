import { Box, Spacer } from 'ink'

import { useInputProcess } from '../hooks/useInputProcess.ts'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'

import type { ReactElement } from 'react'

interface LayoutProps {
	children: ReactElement
}

export const Layout = ({ children }: LayoutProps) => {
	useInputProcess()

	return (
		<Box flexDirection="column" height={35}>
			<Header />
			<Box paddingLeft={2}>{children}</Box>
			<Spacer />
			<Footer />
		</Box>
	)
}
