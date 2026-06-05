import { Box, Spacer } from 'ink'
import { InkPictureProvider } from 'ink-picture'

import { useInputProcess } from '../hooks/useInputProcess.ts'
import { theme } from '../utils/theme.ts'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'

import type { ReactElement } from 'react'

interface LayoutProps {
	children: ReactElement
}

export const Layout = ({ children }: LayoutProps) => {
	useInputProcess()

	return (
		<Box flexDirection="column" height={theme.sizes.fullHeight}>
			<Header />
			<Box paddingLeft={2}>
				<InkPictureProvider>{children}</InkPictureProvider>
			</Box>
			<Spacer />
			<Footer />
		</Box>
	)
}
