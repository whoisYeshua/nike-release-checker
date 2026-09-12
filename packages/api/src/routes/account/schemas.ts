/**
 * JSON Schema objects for the /v1/account/* endpoints.
 * Plain JSON Schema (no TypeBox) since @sinclair/typebox is not installed.
 * These are registered with Fastify for OpenAPI auto-doc.
 */

export const AccountResponse = {
  $id: 'AccountResponse',
  type: 'object',
  required: ['id', 'email', 'tier', 'created_at', 'deleted_at'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    tier: { type: 'string', enum: ['solo', 'pro', 'enterprise'] },
    created_at: { type: 'string', format: 'date-time' },
    stripe_customer_id: { type: 'string' },
    deleted_at: { type: ['string', 'null'], format: 'date-time' },
  },
} as const

export const UsageResponse = {
  $id: 'UsageResponse',
  type: 'object',
  required: ['period', 'cops_count', 'cops_cost_cents', 'currency', 'breakdown'],
  properties: {
    period: {
      type: 'object',
      required: ['start', 'end'],
      properties: {
        start: { type: 'string', format: 'date-time' },
        end: { type: 'string', format: 'date-time' },
      },
    },
    cops_count: { type: 'integer', minimum: 0 },
    cops_cost_cents: { type: 'integer', minimum: 0 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    breakdown: {
      type: 'array',
      items: {
        type: 'object',
        required: ['date', 'cops', 'cost_cents'],
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          cops: { type: 'integer' },
          cost_cents: { type: 'integer' },
        },
      },
    },
  },
} as const

export const ApiKeyListResponse = {
  $id: 'ApiKeyListResponse',
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key_id', 'created_at'],
        properties: {
          key_id: { type: 'string' },
          label: { type: ['string', 'null'] },
          created_at: { type: 'string', format: 'date-time' },
          last_used_at: { type: ['string', 'null'], format: 'date-time' },
          revoked_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
  },
} as const
