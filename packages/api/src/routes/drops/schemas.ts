// JSON Schema definitions for /v1/drops routes.
// Using plain JSON Schema objects (compatible with Fastify's built-in AJV validator).

export const CreateDropBodySchema = {
  type: 'object',
  required: ['country', 'sku', 'sizes', 'maxAccounts', 'paymentMethodId'],
  additionalProperties: false,
  properties: {
    country: { type: 'string', pattern: '^[A-Z]{2}$' },
    sku: { type: 'string', pattern: '^[A-Z0-9-]{6,20}$' },
    sizes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 },
    maxAccounts: { type: 'integer', minimum: 1, maximum: 500 },
    paymentMethodId: { type: 'string', minLength: 1 },
    scheduledAt: { type: 'string', format: 'date-time' },
  },
} as const

export const DropResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    state: { type: 'string' },
    country: { type: 'string' },
    sku: { type: 'string' },
    sizes: { type: 'array', items: { type: 'string' } },
    max_accounts: { type: 'integer' },
    payment_method_id: { type: 'string' },
    scheduled_at: { type: 'string', nullable: true },
    created_at: { type: 'string' },
    completed_at: { type: 'string', nullable: true },
    runs: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        completed: { type: 'integer' },
        failed: { type: 'integer' },
        in_progress: { type: 'integer' },
      },
    },
  },
} as const

export const ListOrdersQuerySchema = {
  type: 'object',
  properties: {
    cursor: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  },
} as const

export const ProblemSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
  },
} as const
