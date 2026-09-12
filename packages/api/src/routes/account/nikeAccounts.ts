/**
 * REST routes for Nike account vault — Story 16.4
 *
 * POST   /v1/account/nike-accounts        — create & encrypt credentials
 * GET    /v1/account/nike-accounts        — list metadata (paginated)
 * GET    /v1/account/nike-accounts/:id    — single account metadata
 * PATCH  /v1/account/nike-accounts/:id   — rotate password / proxy_url / preferred_sizes
 * DELETE /v1/account/nike-accounts/:id   — hard delete (409 if in-flight drop_run)
 *
 * Responses are metadata-only; password, full email, proxy_url are NEVER returned.
 * `NikeAccountMetaSchema` declares additionalProperties: false so Fastify
 * serialisation strips any accidentally-included plaintext fields.
 */

import type { FastifyInstance } from 'fastify'
import { nikeAccountsDb } from '../../db/nikeAccounts.ts'
import { hasInFlight } from '../../db/dropRuns.ts'
import { audit } from '../../services/audit.ts'

// ---------------------------------------------------------------------------
// JSON Schema (inline)
// ---------------------------------------------------------------------------

const NikeAccountMetaSchema = {
  type: 'object' as const,
  required: ['id', 'country', 'email_masked', 'session_status', 'preferred_sizes', 'created_at'],
  properties: {
    id: { type: 'string' },
    country: { type: 'string' },
    email_masked: { type: 'string' },
    session_status: { type: 'string' },
    last_login_at: { type: ['string', 'null'] },
    preferred_sizes: { type: 'array', items: { type: 'string' } },
    created_at: { type: 'string' },
  },
  additionalProperties: false,
}

const CreateBodySchema = {
  type: 'object' as const,
  required: ['email', 'password', 'country'],
  properties: {
    email: { type: 'string' },
    password: { type: 'string' },
    country: { type: 'string' },
    proxy_url: { type: 'string' },
    preferred_sizes: { type: 'array', items: { type: 'string' } },
  },
}

const PatchBodySchema = {
  type: 'object' as const,
  properties: {
    password: { type: 'string' },
    proxy_url: { type: ['string', 'null'] },
    preferred_sizes: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
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

export async function nikeAccountsRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v1/account/nike-accounts */
  app.post(
    '/v1/account/nike-accounts',
    {
      schema: {
        tags: ['nike-accounts'],
        summary: 'Register a Nike account (credentials encrypted at rest)',
        body: CreateBodySchema,
        response: { 201: NikeAccountMetaSchema },
      },
    },
    async (req, reply) => {
      const body = req.body as {
        email: string
        password: string
        country: string
        proxy_url?: string
        preferred_sizes?: string[]
      }

      let meta
      try {
        meta = await nikeAccountsDb.create(req.customerId!, body)
      } catch (err) {
        const e = err as { code?: string; statusCode?: number }
        if (e.code === 'nike_account_already_registered') {
          return reply.code(409 as 201).send(problem('nike-account-already-registered', 409))
        }
        throw err
      }

      audit.log(req, 'nike_account.create', meta.id, { country: meta.country })
      return reply
        .code(201)
        .header('Location', `/v1/account/nike-accounts/${meta.id}`)
        .send(meta)
    },
  )

  /** GET /v1/account/nike-accounts */
  app.get(
    '/v1/account/nike-accounts',
    {
      schema: {
        tags: ['nike-accounts'],
        summary: 'List Nike accounts (metadata only, paginated)',
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
              data: { type: 'array', items: NikeAccountMetaSchema },
              next_cursor: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    async (req) => {
      const query = req.query as { cursor?: string; limit?: number }
      return nikeAccountsDb.listMetadata(req.customerId!, query.cursor, query.limit ?? 50)
    },
  )

  /** GET /v1/account/nike-accounts/:id */
  app.get(
    '/v1/account/nike-accounts/:id',
    {
      schema: {
        tags: ['nike-accounts'],
        summary: 'Get a single Nike account (metadata only)',
        response: {
          200: NikeAccountMetaSchema,
          404: { type: 'object' as const },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const meta = await nikeAccountsDb.getMetadata(id, req.customerId!)
      if (!meta) return reply.code(404).send(problem('not-found', 404))
      return meta
    },
  )

  /** PATCH /v1/account/nike-accounts/:id */
  app.patch(
    '/v1/account/nike-accounts/:id',
    {
      schema: {
        tags: ['nike-accounts'],
        summary: 'Rotate password, proxy_url, or preferred_sizes',
        body: PatchBodySchema,
        response: {
          204: { type: 'null' as const },
          404: { type: 'object' as const },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = req.body as {
        password?: string
        proxy_url?: string | null
        preferred_sizes?: string[]
      }
      const updated = await nikeAccountsDb.update(id, req.customerId!, body)
      if (!updated) return reply.code(404).send(problem('not-found', 404))
      audit.log(req, 'nike_account.update', id)
      return reply.code(204).send()
    },
  )

  /** DELETE /v1/account/nike-accounts/:id */
  app.delete(
    '/v1/account/nike-accounts/:id',
    {
      schema: {
        tags: ['nike-accounts'],
        summary: 'Hard-delete a Nike account (409 if referenced by in-flight drop_run)',
        response: {
          204: { type: 'null' as const },
          404: { type: 'object' as const },
          409: { type: 'object' as const },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }

      // Check in-flight drop runs before deleting
      if (hasInFlight(id)) {
        return reply.code(409).send(problem('account-in-use', 409))
      }

      const deleted = await nikeAccountsDb.remove(id, req.customerId!)
      if (!deleted) return reply.code(404).send(problem('not-found', 404))

      audit.log(req, 'nike_account.delete', id)
      return reply.code(204).send()
    },
  )
}
