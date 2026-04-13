import { mockServer } from '@nike-release-checker/sdk/mocks'

import { logger } from './utils/logger.ts'

mockServer.listen({ onUnhandledRequest: 'bypass' })
logger.debug('mock server initialized', { scope: 'devEntry' })
import('./index.tsx')
