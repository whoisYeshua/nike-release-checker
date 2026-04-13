import { render } from 'ink'
import { TerminalInfoProvider } from 'ink-picture'

import { Layout } from './layout/index.ts'
import { Pages } from './pages/Pages.tsx'
import { clearOutput } from './utils/clearOutput.ts'
import { logger } from './utils/logger.ts'

clearOutput()
logger.debug('CLI application initialized', { scope: 'index' })
render(
	<TerminalInfoProvider>
		<Layout>
			<Pages />
		</Layout>
	</TerminalInfoProvider>
)
