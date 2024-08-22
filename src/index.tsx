import { render } from 'ink'

import { clearOutput } from './utils/clearOutput'
import { Layout } from './layout/index'

clearOutput()
render(<Layout />)
