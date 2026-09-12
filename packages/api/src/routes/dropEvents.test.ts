// Integration tests for Story 17.4 — Drop Event Stream WebSocket
//
// Uses app.injectWS from @fastify/websocket for in-process WS testing.
// Auth: pre-computed argon2id hash (same as auth.test.ts).

import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'

import { buildApp } from '../app.ts'
import { apiKeysDb } from '../db/apiKeys.ts'
import { dropsDb } from '../db/drops.ts'
import { dropEventBus } from '../events/dropEventBus.ts'
import type { DropEvent } from '../events/dropEventTaxonomy.ts'
import { _resetDropRunStore } from '../drops/dropRunRepository.ts'

// Pre-computed argon2id hash for test secret (same key as auth.test.ts)
const TEST_SECRET = 'testsecretabcdefghijklmnopqrstuvwx'
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$u0H9L+Y2c+SHGicZFKfdUw$u/yrWlbPjrPJCQlXRCRNc4lPhgfUyzn8qKsn2jyIFGY'

const KEY_ID = 'ke17ab'
const CUSTOMER_A = 'cust_aaa'
const CUSTOMER_B = 'cust_bbb'
const KEY_ID_B = 'ke18bb'
const VALID_TOKEN = `nrc_${KEY_ID}_${TEST_SECRET}`

function seedKey(keyId: string, customerId: string): void {
  apiKeysDb._seed({ key_id: keyId, customer_id: customerId, secret_hash: TEST_HASH, created_at: new Date() })
}

function createDrop(customerId: string) {
  return dropsDb.create({
    customerId,
    country: 'US',
    sku: 'TEST-SKU-001',
    sizes: ['10'],
    maxAccounts: 1,
    paymentMethodId: 'pm_test',
  })
}

/** Collect first N messages from the WS as parsed JSON. */
function collectMessages(ws: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['injectWS']>>, count: number): Promise<DropEvent[]> {
  return new Promise((resolve, reject) => {
    const msgs: DropEvent[] = []
    const onMsg = (data: unknown) => {
      try {
        const ev = JSON.parse(String(data)) as DropEvent
        msgs.push(ev)
        if (msgs.length >= count) {
          ws.off('message', onMsg)
          resolve(msgs)
        }
      } catch (err) {
        reject(err)
      }
    }
    ws.on('message', onMsg)
    ws.on('error', reject)
  })
}

/** Promise that resolves when the WS closes, with the close code. */
function onClose(ws: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['injectWS']>>): Promise<number> {
  return new Promise((resolve) => {
    ws.on('close', (code: number) => resolve(code))
    ws.on('error', () => resolve(-1))
  })
}

beforeEach(() => {
  apiKeysDb._clear()
  dropsDb._reset()
  _resetDropRunStore()
})

describe('dropEvents WebSocket — Story 17.4', () => {
  it('auth via query-string api_key → receives drop.snapshot first', async () => {
    seedKey(KEY_ID, CUSTOMER_A)
    const drop = createDrop(CUSTOMER_A)
    const app = await buildApp()
    await app.ready()

    const ws = await app.injectWS(`/v1/drops/${drop.id}/events?api_key=${VALID_TOKEN}`)
    const [snapshot] = await collectMessages(ws, 1)
    ws.terminate()
    await app.close()

    assert.ok(snapshot != null)
    assert.equal(snapshot!.event, 'drop.snapshot')
    assert.equal(snapshot!.drop_id, drop.id)
    assert.ok('data' in snapshot!)
  })

  it('auth via initial message {type:"auth",token} → receives drop.snapshot', async () => {
    seedKey(KEY_ID, CUSTOMER_A)
    const drop = createDrop(CUSTOMER_A)
    const app = await buildApp()
    await app.ready()

    const ws = await app.injectWS(
      `/v1/drops/${drop.id}/events`,
      {},
      {
        onOpen(socket) {
          socket.send(JSON.stringify({ type: 'auth', token: VALID_TOKEN }))
        },
      },
    )
    const [snapshot] = await collectMessages(ws, 1)
    ws.terminate()
    await app.close()

    assert.ok(snapshot != null)
    assert.equal(snapshot!.event, 'drop.snapshot')
  })

  it('drop owned by different customer → close code 4404', async () => {
    seedKey(KEY_ID, CUSTOMER_A)
    seedKey(KEY_ID_B, CUSTOMER_B)
    const dropOwnedByB = createDrop(CUSTOMER_B)
    const app = await buildApp()
    await app.ready()

    // Customer A tries to subscribe to Customer B's drop
    const ws = await app.injectWS(`/v1/drops/${dropOwnedByB.id}/events?api_key=${VALID_TOKEN}`)
    const code = await onClose(ws)
    await app.close()

    assert.equal(code, 4404)
  })

  it('invalid api_key → close code 4401', async () => {
    const app = await buildApp()
    await app.ready()

    const ws = await app.injectWS(`/v1/drops/drp_doesntmatter/events?api_key=nrc_bad000_badsecretbadsecretbadsecretbad`)
    const code = await onClose(ws)
    await app.close()

    assert.equal(code, 4401)
  })

  it('live event delivery — bus.publish reaches client', async () => {
    seedKey(KEY_ID, CUSTOMER_A)
    const drop = createDrop(CUSTOMER_A)
    const app = await buildApp()
    await app.ready()

    const ws = await app.injectWS(`/v1/drops/${drop.id}/events?api_key=${VALID_TOKEN}`)

    // Wait for snapshot first: guarantees the server-side bus subscription is
    // active before we publish the live event, eliminating the 50 ms timing race.
    const [snapshot] = await collectMessages(ws, 1)

    // Subscription is established once snapshot has been received; collect next event.
    const liveCollect = collectMessages(ws, 1)

    dropEventBus.publish(drop.id, {
      event: 'drop.activated',
      drop_id: drop.id,
      timestamp: new Date().toISOString(),
      data: { run_count: 1 },
    })

    const [live] = await liveCollect
    ws.terminate()
    await app.close()

    assert.equal(snapshot!.event, 'drop.snapshot')
    assert.ok(live != null)
    assert.equal(live!.event, 'drop.activated')
  })

  it('backpressure: bufferedAmount > 1 MB → close code 1013', async () => {
    seedKey(KEY_ID, CUSTOMER_A)
    const drop = createDrop(CUSTOMER_A)
    const app = await buildApp()
    await app.ready()

    const ws = await app.injectWS(`/v1/drops/${drop.id}/events?api_key=${VALID_TOKEN}`)
    const closePromise = onClose(ws)

    // Wait for the server to attach the WS, then stub bufferedAmount on the
    // SERVER-side socket (the safeSend check runs server-side).
    await new Promise<void>((r) => setTimeout(r, 80))
    for (const serverSocket of app.websocketServer.clients) {
      Object.defineProperty(serverSocket, 'bufferedAmount', {
        get: () => 2_000_000,
        configurable: true,
      })
    }

    dropEventBus.publish(drop.id, {
      event: 'drop.armed',
      drop_id: drop.id,
      timestamp: new Date().toISOString(),
      data: { fire_at: new Date().toISOString() },
    })

    const code = await closePromise
    await app.close()

    assert.equal(code, 1013)
  })
})
