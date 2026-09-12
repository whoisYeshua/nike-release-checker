// Drop scheduler — Story 17.2
// Polls the drops store every `intervalMs` ms.
// Promotes SCHEDULED → ARMED at T-5 min, ARMED → ACTIVE at T-0.
// Uses Postgres advisory lock for leader election (in-memory fallback for tests).

import { dropsDb } from '../db/drops.ts'
import { transitionState } from '../drops/dropRepository.ts'
import { canPromoteToActive } from './concurrencyCap.ts'
import type { WorkerPoolClient } from './workerPoolClient.ts'

// Default lock key for pg_try_advisory_lock. Must fit in bigint.
// Exported so callers can pass it to their pg_try_advisory_lock calls.
export const DEFAULT_LOCK_KEY = BigInt('0xD0EDEDED1')
const TICK_SLOW_THRESHOLD_MS = 5_000
const WARMUP_WINDOW_MS = 5 * 60 * 1_000 // 5 minutes

export interface SchedulerDeps {
  workerPool: WorkerPoolClient
  intervalMs?: number
  /** Override lock key (useful in tests to run multiple instances). Defaults to DEFAULT_LOCK_KEY. */
  leaderLockKey?: bigint // reserved for future Postgres advisory lock integration
  /**
   * Leader-election strategy. Defaults to 'always-leader' (no DB advisory lock).
   * Set to 'pg' to use pg_try_advisory_lock via the provided `acquireLock` function.
   */
  acquireLock?: () => Promise<boolean>
  releaseLock?: () => Promise<void>
  /** Logger-compatible object. Defaults to console. */
  logger?: {
    info(data: Record<string, unknown>, msg: string): void
    warn(data: Record<string, unknown>, msg: string): void
  }
}

export interface DropScheduler {
  start(): Promise<void>
  stop(): Promise<void>
}

// Metrics counters — in-memory, reset on process restart.
// In v3.2, replaced by proper Prometheus histogram / counters.
const metrics = {
  tickCount: 0,
  slowTickCount: 0,
  promotionsArmed: 0,
  promotionsActive: 0,
}

export function getSchedulerMetrics(): Readonly<typeof metrics> {
  return { ...metrics }
}

/** Reset metrics between tests. */
export function _resetSchedulerMetrics(): void {
  metrics.tickCount = 0
  metrics.slowTickCount = 0
  metrics.promotionsArmed = 0
  metrics.promotionsActive = 0
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

export function createDropScheduler(deps: SchedulerDeps): DropScheduler {
  const {
    workerPool,
    intervalMs = 1_000,
    acquireLock = async () => true,
    releaseLock = async () => {},
    logger = defaultLogger(),
  } = deps

  let timer: ReturnType<typeof setInterval> | null = null
  let running = false

  async function tick(): Promise<void> {
    const start = performance.now()
    metrics.tickCount++

    // Leader election
    const isLeader = await acquireLock()
    if (!isLeader) {
      return
    }

    try {
      const now = Date.now()
      const warmupCutoff = new Date(now + WARMUP_WINDOW_MS).toISOString()
      const nowIso = new Date(now).toISOString()

      // ── Phase 1: SCHEDULED → ARMED (T-5 min window) ──────────────────────
      const toArm = dropsDb
        .findByStates(['SCHEDULED'])
        .filter((r) => r.scheduled_at != null && r.scheduled_at <= warmupCutoff)

      for (const row of toArm) {
        try {
          transitionState(row.id, 'ARMED', 'scheduler:tick', row.customer_id)
          metrics.promotionsArmed++
          logger.info({ dropId: row.id }, 'scheduler.promotion.armed')
        } catch (err) {
          // Race condition or already transitioned — skip silently
          logger.warn(
            { dropId: row.id, err: String(err) },
            'scheduler.promotion.armed.skip',
          )
        }
      }

      // ── Phase 2: ARMED → ACTIVE (T-0) ────────────────────────────────────
      const toActivate = dropsDb
        .findByStates(['ARMED'])
        .filter((r) => r.scheduled_at != null && r.scheduled_at <= nowIso)

      for (const row of toActivate) {
        const cap = await canPromoteToActive(row.customer_id)
        if (!cap.allowed) {
          logger.warn(
            {
              customerId: row.customer_id,
              dropId: row.id,
              current: cap.current,
              max: cap.max,
            },
            'scheduler.quota.exceeded',
          )
          continue
        }

        let transitioned = false
        try {
          transitionState(row.id, 'ACTIVE', 'scheduler:tick', row.customer_id)
          transitioned = true
          metrics.promotionsActive++
          logger.info({ dropId: row.id }, 'scheduler.promotion.active')
          await workerPool.dispatchDrop(row.id)
        } catch (err) {
          if (!transitioned) {
            // State machine rejected transition (race/already transitioned) — skip
            logger.warn(
              { dropId: row.id, err: String(err) },
              'scheduler.promotion.active.skip',
            )
          } else {
            // transitionState succeeded but dispatchDrop failed — log at WARN.
            // Drop is now ACTIVE; the lease reaper or a worker poll will pick it up.
            logger.warn(
              { dropId: row.id, err: String(err) },
              'scheduler.dispatch.failed',
            )
          }
        }
      }
    } finally {
      await releaseLock()

      const durationMs = performance.now() - start
      if (durationMs > TICK_SLOW_THRESHOLD_MS) {
        metrics.slowTickCount++
        logger.warn({ durationMs }, 'scheduler.tick.slow')
      } else {
        logger.info({ durationMs }, 'scheduler.tick.duration_ms')
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (running) return
      running = true
      timer = setInterval(() => {
        void tick()
      }, intervalMs)
      timer.unref?.()
    },

    async stop(): Promise<void> {
      running = false
      if (timer != null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
