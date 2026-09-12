import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { dropsDb } from '../../db/drops.ts'
import { audit } from '../../services/audit.ts'
import { scheduler } from '../../services/scheduler.ts'
import {
  CreateDropBodySchema,
  DropResponseSchema,
  ListOrdersQuerySchema,
  ProblemSchema,
} from './schemas.ts'

function problem(slug: string, status: number): Record<string, unknown> {
  const titles: Record<string, string> = {
    'not-found': 'Resource not found',
    'invalid-state': 'State transition not allowed',
    'validation-error': 'Request validation failed',
  }
  return {
    type: `https://api.nike-release-checker.com/problems/${slug}`,
    title: titles[slug] ?? slug,
    status,
  }
}

async function _dropsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v1/drops
   * Create a new drop in DRAFT state.
   */
  app.post<{
    Body: {
      country: string
      sku: string
      sizes: string[]
      maxAccounts: number
      paymentMethodId: string
      scheduledAt?: string
    }
  }>(
    '/v1/drops',
    {
      schema: {
        tags: ['drops'],
        summary: 'Create a drop',
        body: CreateDropBodySchema,
        response: {
          201: DropResponseSchema,
          400: ProblemSchema,
        },
      },
    },
    async (req, reply) => {
      const { country, sku, sizes, maxAccounts, paymentMethodId, scheduledAt } = req.body
      const drop = dropsDb.create({
        customerId: req.customerId!,
        country,
        sku,
        sizes,
        maxAccounts,
        paymentMethodId,
        scheduledAt,
      })
      audit.log(req, 'drop.create', drop.id)
      return reply
        .code(201)
        .header('Location', `/v1/drops/${drop.id}`)
        .send({
          ...drop,
          runs: { total: 0, completed: 0, failed: 0, in_progress: 0 },
        })
    },
  )

  /**
   * GET /v1/drops/:id
   * Fetch a single drop (scoped to customer).
   */
  app.get<{ Params: { id: string } }>(
    '/v1/drops/:id',
    {
      schema: {
        tags: ['drops'],
        summary: 'Get a drop',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          200: DropResponseSchema,
          404: ProblemSchema,
        },
      },
    },
    async (req, reply) => {
      const drop = dropsDb.findById(req.params.id, req.customerId!)
      if (drop == null) {
        return reply.code(404).send(problem('not-found', 404))
      }
      return reply.send({
        ...drop,
        runs: { total: 0, completed: 0, failed: 0, in_progress: 0 },
      })
    },
  )

  /**
   * POST /v1/drops/:id/run
   * Trigger execution: DRAFT → SCHEDULED (future) or DRAFT → ACTIVE (now).
   */
  app.post<{ Params: { id: string } }>(
    '/v1/drops/:id/run',
    {
      schema: {
        tags: ['drops'],
        summary: 'Trigger a drop',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          202: { type: 'null' },
          404: ProblemSchema,
          409: ProblemSchema,
        },
      },
    },
    async (req, reply) => {
      const drop = dropsDb.findById(req.params.id, req.customerId!)
      if (drop == null) {
        return reply.code(404).send(problem('not-found', 404))
      }
      const targetState =
        drop.scheduled_at != null && new Date(drop.scheduled_at) > new Date()
          ? 'SCHEDULED'
          : 'ACTIVE'
      const updated = dropsDb.updateState(drop.id, req.customerId!, ['DRAFT'], targetState)
      if (updated == null) {
        return reply.code(409).send(problem('invalid-state', 409))
      }
      await scheduler.enqueue(updated)
      audit.log(req, 'drop.run', drop.id)
      return reply.code(202).header('Location', `/v1/drops/${drop.id}`).send()
    },
  )

  /**
   * DELETE /v1/drops/:id
   * Cancel a drop (soft delete). Only valid in DRAFT or SCHEDULED state.
   */
  app.delete<{ Params: { id: string } }>(
    '/v1/drops/:id',
    {
      schema: {
        tags: ['drops'],
        summary: 'Cancel a drop',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          204: { type: 'null' },
          409: ProblemSchema,
        },
      },
    },
    async (req, reply) => {
      const updated = dropsDb.updateState(
        req.params.id,
        req.customerId!,
        ['DRAFT', 'SCHEDULED'],
        'CANCELLED',
      )
      if (updated == null) {
        return reply.code(409).send(problem('invalid-state', 409))
      }
      audit.log(req, 'drop.delete', req.params.id)
      return reply.code(204).send()
    },
  )

  /**
   * GET /v1/drops/:id/orders
   * Paginated orders for a drop.
   */
  app.get<{
    Params: { id: string }
    Querystring: { cursor?: string; limit?: number }
  }>(
    '/v1/drops/:id/orders',
    {
      schema: {
        tags: ['drops'],
        summary: 'List orders for a drop',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        querystring: ListOrdersQuerySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    nike_order_number: { type: 'string' },
                    total_amount_cents: { type: 'integer' },
                    currency: { type: 'string' },
                    status: { type: 'string' },
                    created_at: { type: 'string' },
                    drop_run_id: { type: 'string' },
                  },
                },
              },
              cursor: { type: 'string', nullable: true },
            },
          },
          404: ProblemSchema,
        },
      },
    },
    async (req, reply) => {
      const drop = dropsDb.findById(req.params.id, req.customerId!)
      if (drop == null) {
        return reply.code(404).send(problem('not-found', 404))
      }
      const limit = req.query.limit ?? 50
      const page = dropsDb.listOrders(drop.id, req.customerId!, req.query.cursor, limit)
      return reply.send(page)
    },
  )
}

export const dropsRoutes = fp(_dropsRoutes, { name: 'dropsRoutes' })
