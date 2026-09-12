// Drop event taxonomy — Story 17.4
// Canonical TypeScript union for all WebSocket / webhook drop events.
// The OpenAPI generator (Story 15.6) derives published schemas from this file.

import type { DropRow } from '../db/drops.ts'
import type { DropRun } from '../drops/dropRunRepository.ts'

export type DropEvent =
  | {
      event: 'drop.snapshot'
      drop_id: string
      timestamp: string
      data: { drop: DropRow; runs: DropRun[] }
    }
  | {
      event: 'drop.armed'
      drop_id: string
      timestamp: string
      data: { fire_at: string }
    }
  | {
      event: 'drop.activated'
      drop_id: string
      timestamp: string
      data: { run_count: number }
    }
  | {
      event: 'drop.completed'
      drop_id: string
      timestamp: string
      data: { cops: number; fails: number; skipped: number }
    }
  | {
      event: 'drop.cancelled'
      drop_id: string
      timestamp: string
      data: { reason: string }
    }
  | {
      event: 'account.copping'
      drop_id: string
      run_id: string
      account_id: string
      timestamp: string
      data: { worker_id: string; attempt: number }
    }
  | {
      event: 'account.cop'
      drop_id: string
      run_id: string
      account_id: string
      timestamp: string
      data: { order_number: string; duration_ms: number }
    }
  | {
      event: 'account.fail'
      drop_id: string
      run_id: string
      account_id: string
      timestamp: string
      data: {
        classification: string
        reason: string
        attempt: number
        will_retry: boolean
      }
    }
  | {
      event: 'account.skipped'
      drop_id: string
      run_id: string
      account_id: string
      timestamp: string
      data: { reason: string }
    }
  // ── Warmup events (Story 17.5) ──────────────────────────────────────────
  | {
      event: 'warmup.polling'
      drop_id: string
      timestamp: string
      data: { sku: string }
    }
  | {
      event: 'warmup.slug_resolved'
      drop_id: string
      timestamp: string
      data: { slug: string }
    }
  | {
      event: 'warmup.collapsed'
      drop_id: string
      timestamp: string
      data: { slug: string }
    }
  | {
      event: 'warmup.sessions_validated'
      drop_id: string
      timestamp: string
      data: { valid: number; total: number }
    }
  | {
      event: 'warmup.account_validating'
      drop_id: string
      account_id: string
      timestamp: string
      data: Record<string, never>
    }
  | {
      event: 'warmup.account_validated'
      drop_id: string
      account_id: string
      timestamp: string
      data: Record<string, never>
    }
  | {
      event: 'warmup.session_failed'
      drop_id: string
      account_id: string
      timestamp: string
      data: { reason: string }
    }
  | {
      event: 'warmup.contexts_launched'
      drop_id: string
      timestamp: string
      data: { count: number }
    }
  | {
      event: 'warmup.account_launching'
      drop_id: string
      account_id: string
      timestamp: string
      data: Record<string, never>
    }
  | {
      event: 'warmup.account_ready'
      drop_id: string
      account_id: string
      timestamp: string
      data: Record<string, never>
    }
  | {
      event: 'warmup.account_launch_failed'
      drop_id: string
      account_id: string
      timestamp: string
      data: { reason: string }
    }
  | {
      event: 'warmup.ready'
      drop_id: string
      timestamp: string
      data: { valid_run_ids: string[]; skipped_run_ids: string[] }
    }
  | {
      event: 'warmup.cancelled'
      drop_id: string
      timestamp: string
      data: Record<string, never>
    }
