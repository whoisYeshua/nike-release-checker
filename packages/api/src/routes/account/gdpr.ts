/**
 * GDPR account delete + restore endpoints — Story 16.5, Task 5
 *
 *  DELETE /v1/account        — soft-delete + trigger PII purge
 *  POST   /v1/account/restore — stub (501) — admin-only in v3.0
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { customersDb } from '../../db/customers.ts'
import { apiKeysDb } from '../../db/apiKeys.ts'
import { dropsDb } from '../../db/drops.ts'
import { audit } from '../../services/audit.ts'
import { purgePii } from '../../services/gdpr/purgePii.ts'
import { invalidateDek } from '../../crypto/dekCache.ts'

function problem(
  slug: string,
  status: number,
  detail?: string,
): Record<string, unknown> {
  const ret: Record<string, unknown> = {
    type: `https://api.nike-release-checker.com/problems/${slug}`,
    title: slug,
    status,
  }
  if (detail != null) ret['detail'] = detail
  return ret
}

async function _gdprRoutes(app: FastifyInstance): Promise<void> {
  /**
   * DELETE /v1/account
   *
   * Header: X-Confirm-Delete: yes   (required)
   * Body:   { reason?: string }       (optional)
   *
   * Returns 202 { deleted_at, scheduled_purge_at }
   */
  app.delete(
    '/v1/account',
    {
      schema: {
        tags: ['account'],
        summary: 'GDPR right-to-erasure — soft-delete account and schedule hard-purge',
        response: {
          202: {
            type: 'object' as const,
            properties: {
              deleted_at: { type: 'string' as const },
              scheduled_purge_at: { type: 'string' as const },
            },
          },
          400: { type: 'object' as const },
          409: { type: 'object' as const },
        },
      },
    },
    async (req, reply) => {
      if (req.headers['x-confirm-delete'] !== 'yes') {
        void reply
          .code(400)
          .type('application/problem+json')
          .send(problem('confirmation-required', 400, 'Send header X-Confirm-Delete: yes to confirm'))
        return
      }

      const customerId = req.customerId!

      if (dropsDb.hasActiveOrScheduled(customerId)) {
        void reply
          .code(409)
          .type('application/problem+json')
          .send(
            problem(
              'drops-in-flight',
              409,
              'Cancel or wait for ACTIVE/SCHEDULED drops before deleting the account',
            ),
          )
        return
      }

      const deletedAt = new Date()
      const purgeAt = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000)

      // Soft-delete customer + revoke all API keys
      customersDb.softDelete(customerId, deletedAt)
      apiKeysDb.revokeAllForCustomer(customerId, deletedAt)

      // Audit log
      const body = req.body as Record<string, unknown> | undefined
      audit.log(req, 'customer.delete', customerId, {
        reason: body?.['reason'] ?? null,
        scheduled_purge_at: purgeAt.toISOString(),
      })

      // Invalidate DEK cache immediately
      invalidateDek(customerId)

      // Fire-and-forget immediate PII purge (24 h SLA — NFR33)
      void purgePii(customerId).catch((err: unknown) => {
        req.log.error({ err }, 'pii_purge_failed')
      })

      return reply.code(202).send({
        deleted_at: deletedAt.toISOString(),
        scheduled_purge_at: purgeAt.toISOString(),
      })
    },
  )

  /**
   * POST /v1/account/restore
   *
   * Self-serve restore requires out-of-band auth (magic link / admin tool).
   * Deferred to v3.1 — returns 501 stub so the route is registered and not a 404.
   */
  app.post(
    '/v1/account/restore',
    {
      config: { auth: 'anonymous' },
      schema: {
        tags: ['account'],
        summary: 'Restore soft-deleted account (admin-only in v3.0)',
      },
    },
    async (_req, reply) => {
      return reply
        .code(501)
        .type('application/problem+json')
        .send(problem('not-implemented', 501, 'Self-serve restore is admin-only in v3.0'))
    },
  )
}

export const gdprRoutes = fp(_gdprRoutes, { name: 'gdprRoutes' })
