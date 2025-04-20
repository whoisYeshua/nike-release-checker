import { mockServer } from '#snkrs-sdk/mocks'

mockServer.listen({ onUnhandledRequest: 'bypass' })
import('./index.tsx')
