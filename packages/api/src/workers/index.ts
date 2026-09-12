/**
 * Worker process entrypoint.
 * Run separately from the API server:  node dist/workers/index.js
 */
import { startWorker } from './webhookDispatcher.ts'

console.log('[webhook-worker] starting')
startWorker(1_000)

process.on('SIGTERM', () => {
  console.log('[webhook-worker] SIGTERM received — shutting down')
  process.exit(0)
})
