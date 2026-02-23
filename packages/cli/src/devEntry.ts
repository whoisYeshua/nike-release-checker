import { mockServer } from '@nike-release-checker/sdk/mocks'

mockServer.listen({ onUnhandledRequest: 'bypass' })
import('./index.tsx')
