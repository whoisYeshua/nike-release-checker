/**
 * REST routes for card vault — Story 16.3
 *
 * POST   /v1/account/cards        — create & encrypt
 * GET    /v1/account/cards        — list metadata (paginated)
 * GET    /v1/account/cards/:id    — single card metadata
 * DELETE /v1/account/cards/:id    — hard delete
 *
 * Responses are metadata-only; PAN and CVV are NEVER returned.
 * `CardMetaSchema` does not declare *_encrypted fields, so Fastify serialisation
 * drops them even if they accidentally appeared in the payload.
 */

import type { FastifyInstance } from 'fastify'
import { cardsDb } from '../../db/cards.ts'
import { audit } from '../../services/audit.ts'

// ---------------------------------------------------------------------------
// JSON Schema (inline — no TypeBox dependency)
// ---------------------------------------------------------------------------

const CardMetaSchema = {
  type: 'object' as const,
  required: ['id', 'brand', 'last4', 'holder_name_masked', 'expiry_month', 'expiry_year_yy', 'created_at'],
  properties: {
    id: { type: 'string' },
    brand: { type: 'string' },
    last4: { type: 'string' },
    holder_name_masked: { type: 'string' },
    expiry_month: { type: 'string' },
    expiry_year_yy: { type: 'string' },
    created_at: { type: 'string' },
  },
  additionalProperties: false,
}

const CreateCardBodySchema = {
  type: 'object' as const,
  required: ['holder_name', 'card_number', 'expiry', 'cvv'],
  properties: {
    holder_name: { type: 'string' },
    card_number: { type: 'string' },
    expiry: { type: 'string' },
    cvv: { type: 'string' },
    brand: { type: 'string' },
    last4: { type: 'string' },
  },
}

function problem(slug: string, status: number): Record<string, unknown> {
  return {
    type: `https://api.nike-release-checker.com/problems/${slug}`,
    title: slug.replace(/-/g, ' '),
    status,
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function cardsRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v1/account/cards */
  app.post(
    '/v1/account/cards',
    {
      schema: {
        tags: ['cards'],
        summary: 'Create and encrypt a payment card',
        body: CreateCardBodySchema,
        response: { 201: CardMetaSchema },
      },
    },
    async (req, reply) => {
      const body = req.body as {
        holder_name: string
        card_number: string
        expiry: string
        cvv: string
        brand?: string
        last4?: string
      }

      let meta
      try {
        meta = await cardsDb.create(req.customerId!, body)
      } catch (err) {
        const e = err as { code?: string; statusCode?: number }
        if (e.code === 'invalid_card_number') {
          return reply.code(400 as 201).send(problem('invalid-card-number', 400))
        }
        throw err
      }

      audit.log(req, 'card.create', meta.id, { last4: meta.last4 })
      return reply
        .code(201)
        .header('Location', `/v1/account/cards/${meta.id}`)
        .send(meta)
    },
  )

  /** GET /v1/account/cards */
  app.get(
    '/v1/account/cards',
    {
      schema: {
        tags: ['cards'],
        summary: 'List payment cards (metadata only)',
        querystring: {
          type: 'object' as const,
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: {
          200: {
            type: 'object' as const,
            properties: {
              data: { type: 'array', items: CardMetaSchema },
              next_cursor: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    async (req) => {
      const query = req.query as { cursor?: string; limit?: number }
      return cardsDb.listMetadata(req.customerId!, query.cursor, query.limit ?? 50)
    },
  )

  /** GET /v1/account/cards/:id */
  app.get(
    '/v1/account/cards/:id',
    {
      schema: {
        tags: ['cards'],
        summary: 'Get a single payment card (metadata only)',
        response: {
          200: CardMetaSchema,
          404: { type: 'object' as const },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const meta = await cardsDb.getMetadata(id, req.customerId!)
      if (!meta) return reply.code(404).send(problem('not-found', 404))
      return meta
    },
  )

  /** DELETE /v1/account/cards/:id */
  app.delete(
    '/v1/account/cards/:id',
    {
      schema: {
        tags: ['cards'],
        summary: 'Hard-delete a payment card',
        response: {
          204: { type: 'null' as const },
          404: { type: 'object' as const },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const ok = await cardsDb.remove(id, req.customerId!)
      if (!ok) return reply.code(404).send(problem('not-found', 404))
      audit.log(req, 'card.delete', id)
      return reply.code(204).send()
    },
  )
}
