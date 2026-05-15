import { render } from 'ink'

import { Layout } from './layout/index.ts'
import { Pages } from './pages/Pages.tsx'
import { clearOutput } from './utils/clearOutput.ts'
import { logger } from './utils/logger.ts'

clearOutput()
logger.debug('CLI application initialized', { scope: 'index' })
render(
	<Layout>
		<Pages />
	</Layout>
)
