import { setupServer } from 'msw/node'

import { handlers } from './handlers/handlers.ts'

export const mockServer = setupServer(...handlers)
