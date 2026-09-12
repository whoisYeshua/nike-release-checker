// Drop event stream WebSocket — Story 17.4
// Endpoint: GET /v1/drops/:id/events  (websocket: true)
//
// Auth:
//   Option A) ?api_key=<token> in query string (browser-friendly, TLS-only)
//   Option B) First JSON message { "type": "auth", "token": "..." } within 1 s
//
// On connect:
//   1. Authenticate → resolve customerId
//   2. Verify ownership of drop (close 4404 if not found / wrong customer)
//   3. Send drop.snapshot (current drop + runs)
//   4. Subscribe to dropEventBus for the drop; forward events to socket
//   5. Backpressure: close 1013 if bufferedAmount > 1 MB before each send
//   6. Heartbeat: ping every 30 s; close 1011 if pong not received within 60 s

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { WebSocket } from '@fastify/websocket'

import { apiKeysDb } from '../db/apiKeys.ts'
import { dropsDb } from '../db/drops.ts'
import { dropRunRepository } from '../drops/dropRunRepository.ts'
import { dropEventBus } from '../events/dropEventBus.ts'
import type { DropEvent } from '../events/dropEventTaxonomy.ts'

// ---- helpers ----------------------------------------------------------------

const TOKEN_RE = /^nrc_([a-z0-9]{6,16})_([a-z0-9]{24,64})$/i
const BACKPRESSURE_BYTES = 1_048_576 // 1 MB
const PING_INTERVAL_MS = 30_000     // 30 s
const PONG_TIMEOUT_MS = 60_000      // 60 s — miss two pings before kill

/**
 * Resolve customerId from an API-key token string.
 * Returns the customerId or null if invalid / revoked.
 */
async function resolveCustomerId(rawToken: string): Promise<string | null> {
  const match = TOKEN_RE.exec(rawToken)
  if (match == null) return null

  const keyId = match[1]!
  const secret = match[2]!

  const row = apiKeysDb.findByKeyId(keyId)
  if (row == null || row.revoked_at != null) return null

  // Constant-time check via argon2 — same as authPlugin
  const { verify: argon2Verify } = await import('argon2')
  let ok: boolean
  try {
    ok = await argon2Verify(row.secret_hash, secret)
  } catch {
    ok = false
  }

  if (!ok) return null

  apiKeysDb.touchLastUsed(keyId)
  return row.customer_id
}

/**
 * Safely send a JSON payload if backpressure allows.
 * Returns false and closes the socket with 1013 when the buffer is full.
 */
function safeSend(socket: WebSocket, payload: DropEvent): boolean {
  if (socket.bufferedAmount > BACKPRESSURE_BYTES) {
    socket.close(1013, 'try again later')
    return false
  }
  socket.send(JSON.stringify(payload))
  return true
}

// ---- plugin -----------------------------------------------------------------

async function _dropEventsRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { api_key?: string } }>(
    '/v1/drops/:id/events',
    {
      websocket: true,
      config: { auth: 'anonymous' }, // WS cannot send Authorization header — auth is done in-handler
    },
    async (socket: WebSocket, req) => {
      const dropId = (req.params as { id: string }).id
      const qs = req.query as { api_key?: string }

      // ── Step 1: Authenticate ──────────────────────────────────────────────
      let customerId: string | null = null

      if (qs.api_key != null && qs.api_key.length > 0) {
        // Option A: query-string token
        customerId = await resolveCustomerId(qs.api_key)
        if (customerId == null) {
          socket.close(4401, 'unauthorized')
          return
        }
      } else {
        // Option B: wait for first JSON message { type: 'auth', token: '...' } within 1 s
        customerId = await new Promise<string | null>((resolve) => {
          const timer = setTimeout(() => {
            resolve(null)
          }, 1_000)

          socket.once('message', (raw: { toString(): string }) => {
            clearTimeout(timer)
            try {
              const msg: unknown = JSON.parse(raw.toString())
              if (
                typeof msg === 'object' &&
                msg !== null &&
                'type' in msg &&
                (msg as Record<string, unknown>)['type'] === 'auth' &&
                'token' in msg &&
                typeof (msg as Record<string, unknown>)['token'] === 'string'
              ) {
                const token = (msg as Record<string, unknown>)['token'] as string
                resolveCustomerId(token).then(resolve).catch(() => resolve(null))
              } else {
                resolve(null)
              }
            } catch {
              resolve(null)
            }
          })
        })

        if (customerId == null) {
          socket.close(4401, 'unauthorized')
          return
        }
      }

      // ── Step 2: Ownership check ───────────────────────────────────────────
      const drop = dropsDb.findById(dropId, customerId)
      if (drop == null) {
        socket.close(4404, 'drop not found or not yours')
        return
      }

      // ── Step 3: Snapshot replay ───────────────────────────────────────────
      const runs = await dropRunRepository.listByDrop(dropId)
      const snapshotSent = safeSend(socket, {
        event: 'drop.snapshot',
        drop_id: dropId,
        timestamp: new Date().toISOString(),
        data: { drop, runs },
      })
      if (!snapshotSent) return

      // ── Step 4: Subscribe to live events ─────────────────────────────────
      const unsubscribe = dropEventBus.subscribe(dropId, (event) => {
        safeSend(socket, event)
      })

      // ── Step 5 & 6: Heartbeat ─────────────────────────────────────────────
      let lastPongAt = Date.now()

      socket.on('pong', () => {
        lastPongAt = Date.now()
      })

      const heartbeat = setInterval(() => {
        if (Date.now() - lastPongAt > PONG_TIMEOUT_MS) {
          clearInterval(heartbeat)
          unsubscribe()
          socket.close(1011, 'pong timeout')
          return
        }
        socket.ping()
      }, PING_INTERVAL_MS)
      // Don't keep the event loop alive solely for the heartbeat timer —
      // tests and graceful shutdown rely on this.
      heartbeat.unref()

      // ── Cleanup ───────────────────────────────────────────────────────────
      socket.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
      })
    },
  )
}

export const dropEventsRoute = fp(_dropEventsRoute, { name: 'dropEventsRoute' })
