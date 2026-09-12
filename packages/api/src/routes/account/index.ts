import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { apiKeysDb } from '../../db/apiKeys.ts'
import { customersDb } from '../../db/customers.ts'
import { usageDb } from '../../db/usage.ts'
import { AccountResponse, ApiKeyListResponse, UsageResponse } from './schemas.ts'

/** Returns a Date set to the first millisecond of the current UTC month. */
function startOfUtcMonth(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function notFound(): { statusCode: 404; message: string } & Error {
	const err = new Error('Not found') as { statusCode: 404; message: string } & Error
	err.statusCode = 404
	return err
}

async function _accountRoutes(app: FastifyInstance): Promise<void> {
	// Register schemas for OpenAPI auto-doc
	app.addSchema(AccountResponse)
	app.addSchema(UsageResponse)
	app.addSchema(ApiKeyListResponse)

	/**
	 * GET /v1/account
	 * Returns the authenticated customer's own record.
	 */
	app.get(
		'/v1/account',
		{
			schema: {
				tags: ['account'],
				summary: 'Get the authenticated customer record',
				response: {
					200: { $ref: 'AccountResponse#' },
					404: { type: 'object' as const },
				},
			},
		},
		async (req, reply) => {
			const customer = customersDb.findById(req.customerId!)
			if (customer == null) {
				return reply.status(404).send({
					type: 'https://api.nike-release-checker.com/problems/not-found',
					title: 'Customer not found',
					status: 404,
				})
			}
			return reply.send({
				id: customer.id,
				email: customer.email,
				tier: customer.tier,
				created_at: customer.created_at.toISOString(),
				...(customer.stripe_customer_id != null ? { stripe_customer_id: customer.stripe_customer_id } : {}),
				deleted_at: customer.deleted_at != null ? customer.deleted_at.toISOString() : null,
			})
		},
	)

	/**
	 * GET /v1/account/usage
	 * Returns month-to-date COP usage and cost for the authenticated customer.
	 */
	app.get(
		'/v1/account/usage',
		{
			schema: {
				tags: ['account'],
				summary: 'Get month-to-date usage and cost',
				response: {
					200: { $ref: 'UsageResponse#' },
				},
			},
		},
		async (req, reply) => {
			const now = new Date()
			const start = startOfUtcMonth(now)
			const rows = usageDb.aggregate(req.customerId!, start, now)

			// Fall back to customer's default_currency or 'USD' when there are no orders
			let currency = rows[0]?.currency ?? 'USD'
			if (rows.length === 0) {
				const customer = customersDb.findById(req.customerId!)
				if (customer?.default_currency != null) {
					currency = customer.default_currency
				}
			}

			return reply.send({
				period: { start: start.toISOString(), end: now.toISOString() },
				cops_count: rows.reduce((a, r) => a + r.cops, 0),
				cops_cost_cents: rows.reduce((a, r) => a + r.cost_cents, 0),
				currency,
				breakdown: rows.map((r) => ({
					date: r.day.toISOString().slice(0, 10),
					cops: r.cops,
					cost_cents: r.cost_cents,
				})),
			})
		},
	)

	/**
	 * GET /v1/account/api-keys
	 * Returns the authenticated customer's API key metadata.
	 * NEVER returns secret_hash or the original secret.
	 */
	app.get(
		'/v1/account/api-keys',
		{
			schema: {
				tags: ['account'],
				summary: 'List API key metadata',
				response: {
					200: { $ref: 'ApiKeyListResponse#' },
				},
			},
		},
		async (req, reply) => {
			const rows = apiKeysDb.listByCustomer(req.customerId!)
			return reply.send({
				data: rows.map((r) => ({
					key_id: r.key_id,
					label: r.label,
					created_at: r.created_at.toISOString(),
					last_used_at: r.last_used_at != null ? r.last_used_at.toISOString() : null,
					revoked_at: r.revoked_at != null ? r.revoked_at.toISOString() : null,
				})),
			})
		},
	)
}

// Suppress unused import warning — notFound helper kept for future use
void notFound

export const accountRoutes = fp(_accountRoutes, { name: 'accountRoutes' })
