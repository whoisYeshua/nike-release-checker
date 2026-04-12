import { render } from 'ink'
import { TerminalInfoProvider } from 'ink-picture'

import { Layout } from './layout/index.ts'
import { Pages } from './pages/Pages.tsx'
import { clearOutput } from './utils/clearOutput.ts'

clearOutput()
render(
	<TerminalInfoProvider>
		<Layout>
			<Pages />
		</Layout>
	</TerminalInfoProvider>
)
