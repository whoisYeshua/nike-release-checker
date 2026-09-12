// Lease reaper — Story 17.3
// Background job that runs every 30 s and re-queues COPPING runs whose
// leased_at is older than the stale threshold (default 5 minutes).
// Surfaces silent worker crashes via structured log events.

import { dropRunRepository } from './dropRunRepository.ts'

export interface LeaseReaperDeps {
  intervalMs?: number
  staleThresholdMs?: number
  logger?: {
    info(data: Record<string, unknown>, msg: string): void
    warn(data: Record<string, unknown>, msg: string): void
  }
}

export interface LeaseReaper {
  start(): void
  stop(): void
}

function defaultLogger() {
  return {
    info(data: Record<string, unknown>, msg: string): void {
      console.log(JSON.stringify({ ...data, msg }))
    },
    warn(data: Record<string, unknown>, msg: string): void {
      console.warn(JSON.stringify({ ...data, msg }))
    },
  }
}

export function createLeaseReaper(deps: LeaseReaperDeps = {}): LeaseReaper {
  const {
    intervalMs = 30_000,
    staleThresholdMs = 5 * 60 * 1_000,
    logger = defaultLogger(),
  } = deps

  let timer: ReturnType<typeof setInterval> | null = null

  async function tick(): Promise<void> {
    const reaped = await dropRunRepository.reapStale(staleThresholdMs)
    if (reaped > 0) {
      logger.warn({ reaped }, 'lease_reaper.reaped')
    } else {
      logger.info({ reaped }, 'lease_reaper.tick')
    }
  }

  return {
    start() {
      if (timer != null) return
      timer = setInterval(() => {
        void tick()
      }, intervalMs)
    },

    stop() {
      if (timer != null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
