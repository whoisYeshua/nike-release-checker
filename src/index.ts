import { createElement } from 'react'
import { render } from 'ink'

import { clearOutput } from './utils/clearOutput.ts'
import { Layout } from './layout/index.ts'
import { Pages } from './pages/Pages.ts'

clearOutput()
render(createElement(Layout, null, createElement(Pages)))
