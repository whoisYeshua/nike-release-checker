import { createElement } from 'react'
import { Box, Spacer } from 'ink'

import { useInputProcess } from '../hooks/useInputProcess.ts'
import { Header } from './Header.ts'
import { Footer } from './Footer.ts'

import type { ReactElement } from 'react'

interface LayoutProps {
	children: ReactElement
}

export const Layout = ({ children }: LayoutProps) => {
	useInputProcess()
	return createElement(
		Box,
		{ flexDirection: 'column', height: 35 },
		createElement(Header, null),
		children,
		createElement(Spacer, null),
		createElement(Footer, null)
	)
}
