import { render } from 'ink'

import { Layout } from './layout/index.ts'
import { Pages } from './pages/Pages.tsx'
import { clearOutput } from './utils/clearOutput.ts'

clearOutput()
render(
	<Layout>
		<Pages />
	</Layout>
)
