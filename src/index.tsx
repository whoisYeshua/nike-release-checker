import { render } from 'ink'

import { clearOutput } from './utils/clearOutput.js'
import { Layout } from './layout/index.js'

clearOutput()
render(<Layout />)
