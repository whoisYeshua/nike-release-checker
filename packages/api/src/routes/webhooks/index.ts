import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { webhooksDb } from '../../db/webhooks.ts'
import { webhookDeliveriesDb } from '../../db/webhookDeliveries.ts'

const ALLOWED_EVENTS = [
  'drop.scheduled',
  'drop.started',
  'drop.cop',
  'drop.fail',
  'drop.completed',
  'order.refunded',
] as const

function generateSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`
}

// TODO Story 15.2: replace anonymous config with API-key auth on all webhook routes
const AUTH_STUB = { config: { auth: 'anonymous' } } as const

async function _webhooksRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v1/webhooks
   * Register a new webhook endpoint.
   * Returns the plaintext secret ONCE — store it securely.
   */
  app.post<{
    Body: { url: string; events_subscribed: string[] }
  }>(
    '/v1/webhooks',
    {
      ...AUTH_STUB,
      schema: {
        tags: ['webhooks'],
        summary: 'Register a webhook endpoint',
        body: {
          type: 'object',
          required: ['url', 'events_subscribed'],
          properties: {
            url: { type: 'string', format: 'uri' },
            events_subscribed: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              url: { type: 'string' },
              events_subscribed: { type: 'array', items: { type: 'string' } },
              secret: { type: 'string', description: 'Shown once — store securely' },
              created_at: { type: 'string' },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { url, events_subscribed } = req.body

      // Validate events
      const invalid = events_subscribed.filter(
        (e) => !(ALLOWED_EVENTS as readonly string[]).includes(e),
      )
      if (invalid.length > 0) {
        return reply.status(400).send({
          type: 'https://nikebotapi.io/errors/invalid-event',
          title: 'Invalid event type(s)',
          status: 400,
          detail: `Unknown event(s): ${invalid.join(', ')}`,
        })
      }

      const secret = generateSecret()
      // TODO Story 16.2: encrypt secret with per-customer DEK before storing
      const row = webhooksDb.insert({
        customer_id: 'stub-customer', // TODO Story 15.2: extract from auth token
        url,
        secret,
        events_subscribed,
        active: true,
      })

      return reply.status(201).send({
        id: row.id,
        url: row.url,
        events_subscribed: row.events_subscribed,
        secret, // plaintext, shown once
        created_at: row.created_at.toISOString(),
      })
    },
  )

  /**
   * GET /v1/webhooks
   * List registered webhook endpoints (no secrets).
   */
  app.get(
    '/v1/webhooks',
    {
      ...AUTH_STUB,
      schema: {
        tags: ['webhooks'],
        summary: 'List webhook endpoints',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                url: { type: 'string' },
                events_subscribed: { type: 'array', items: { type: 'string' } },
                active: { type: 'boolean' },
                created_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      // TODO Story 15.2: filter by authenticated customer
      const rows = webhooksDb.findByCustomer('stub-customer')
      return reply.send(
        rows.map((w) => ({
          id: w.id,
          url: w.url,
          events_subscribed: w.events_subscribed,
          active: w.active,
          created_at: w.created_at.toISOString(),
        })),
      )
    },
  )

  /**
   * DELETE /v1/webhooks/:id
   * Deactivate a webhook endpoint.
   */
  app.delete<{ Params: { id: string } }>(
    '/v1/webhooks/:id',
    {
      ...AUTH_STUB,
      schema: {
        tags: ['webhooks'],
        summary: 'Deactivate a webhook endpoint',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          204: { type: 'null' },
          404: { type: 'object' },
        },
      },
    },
    async (req, reply) => {
      const ok = webhooksDb.deactivate(req.params.id)
      if (!ok) {
        return reply.status(404).send({
          type: 'https://nikebotapi.io/errors/not-found',
          title: 'Webhook not found',
          status: 404,
        })
      }
      return reply.status(204).send()
    },
  )

  /**
   * GET /v1/account/webhooks/dlq
   * List dead-letter deliveries for the authenticated customer.
   */
  app.get(
    '/v1/account/webhooks/dlq',
    {
      ...AUTH_STUB,
      schema: {
        tags: ['webhooks'],
        summary: 'List dead-letter webhook deliveries',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                webhook_id: { type: 'string' },
                event_type: { type: 'string' },
                attempt_count: { type: 'number' },
                created_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      // TODO Story 15.2: filter by authenticated customer
      const rows = webhookDeliveriesDb.listDeadLetter('stub-customer')
      return reply.send(
        rows.map((r) => ({
          id: r.id,
          webhook_id: r.webhook_id,
          event_type: r.event_type,
          attempt_count: r.attempt_count,
          created_at: r.created_at.toISOString(),
        })),
      )
    },
  )

  /**
   * POST /v1/webhooks/test
   * Admin endpoint: send a test ping to a registered webhook.
   * Protected by API key auth in Story 15.2.
   */
  app.post<{ Params: { id: string } }>(
    '/v1/webhooks/:id/test',
    {
      ...AUTH_STUB,
      schema: {
        tags: ['webhooks'],
        summary: 'Send a test ping to a webhook endpoint',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              delivery_id: { type: 'string' },
              status: { type: 'string' },
            },
          },
          404: { type: 'object' },
        },
      },
    },
    async (req, reply) => {
      const webhook = webhooksDb.findById(req.params.id)
      if (!webhook) {
        return reply.status(404).send({
          type: 'https://nikebotapi.io/errors/not-found',
          title: 'Webhook not found',
          status: 404,
        })
      }
      // Emit a test event bypassing the normal transaction (test-only path)
      const { emit } = await import('../../services/webhooks/emit.ts')
      const deliveries: string[] = []
      const tx = {
        webhooks: {
          findActiveSubscribed: async () => [webhook],
        },
        webhookDeliveries: {
          insert: async (row: Parameters<typeof webhookDeliveriesDb.insert>[0]) => {
            const d = webhookDeliveriesDb.insert(row)
            deliveries.push(d.id)
            return d
          },
        },
      }
      await emit(tx, webhook.customer_id, 'ping', { source: 'test' })
      return reply.send({ delivery_id: deliveries[0] ?? null, status: 'queued' })
    },
  )
}

export const webhooksRoutes = fp(_webhooksRoutes, { name: 'webhooksRoutes' })
