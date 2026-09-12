import type { BrowserContext } from 'playwright'
import { removePidFile } from './daemonize.ts'
import { log } from '../logger/logger.ts'

const activeContexts = new Set<BrowserContext>()
let shutdownInProgress = false

/**
 * Register a Playwright BrowserContext for graceful shutdown tracking.
 */
export function registerContext(ctx: BrowserContext): void {
  activeContexts.add(ctx)
}

/**
 * Unregister a context (should be called after context.close()).
 */
export function unregisterContext(ctx: BrowserContext): void {
  activeContexts.delete(ctx)
}

/**
 * Perform graceful shutdown:
 * 1. Abort the controller to stop the monitoring loop
 * 2. Close all active Playwright contexts (10s timeout each via Promise.race)
 * 3. Remove the PID file
 * 4. Exit the process
 *
 * Idempotent — the first signal initiates graceful shutdown.
 * A second signal during shutdown forces exit with code 1.
 */
async function shutdown(controller: AbortController): Promise<void> {
  if (shutdownInProgress) {
    log('warn', 'Forced exit on second signal')
    process.exit(1)
  }
  shutdownInProgress = true

  log('info', 'Graceful shutdown initiated')
  console.log('\nShutting down...')

  controller.abort()

  // Close all active Playwright contexts with a strict 10s timeout per context
  const contextCount = activeContexts.size
  const closePromises = [...activeContexts].map(async (ctx) => {
    const timeoutMs = 10_000
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Context close timed out after 10s')), timeoutMs)
    })
    try {
      await Promise.race([ctx.close(), timeoutPromise])
    } catch {
      // Timed out or already closed -- ignore
    } finally {
      clearTimeout(timer)
      activeContexts.delete(ctx)
    }
  })

  await Promise.allSettled(closePromises)

  removePidFile()
  log('info', `Bot shutting down gracefully. ${contextCount} browser contexts closed.`)
  process.exit(0)
}

/**
 * Register SIGINT and SIGTERM handlers for graceful shutdown.
 * Replaces any previously registered handlers from manual process.on calls.
 */
export function setupGracefulShutdown(controller: AbortController): void {
  const handler = () => { void shutdown(controller) }
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
}
