import { verify as argon2Verify } from 'argon2'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { apiKeysDb } from '../db/apiKeys.ts'
import { customersDb } from '../db/customers.ts'

// Extend Fastify's request type to carry resolved auth context.
declare module 'fastify' {
	interface FastifyRequest {
		customerId?: string
		apiKeyId?: string
	}
	// Allow routes to set config.auth = 'anonymous' to bypass the auth hook.
	interface FastifyContextConfig {
		auth?: 'anonymous'
	}
}

/**
 * Token format: nrc_<keyId>_<secret>
 * - keyId:  6-16 lowercase alphanumeric chars (allows indexed DB lookup)
 * - secret: 24-64 lowercase alphanumeric chars (random, displayed once at creation)
 */
const TOKEN_RE = /^nrc_([a-z0-9]{6,16})_([a-z0-9]{24,64})$/i

/**
 * Pre-computed argon2id hash of a dummy value.
 * Used to keep response time constant when a key_id is not found —
 * prevents timing-based enumeration of valid key IDs.
 */
const DUMMY_HASH =
	'$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$TU/sewH4OFKkWQOXg3la9LMg3gi/7KcxWxX8wQ2Bvk0'

/**
 * Build an RFC 9457 problem-detail object.
 */
function problem(
	slug: 'auth-missing' | 'auth-invalid' | 'auth-revoked',
	status: 401 | 403,
): Record<string, unknown> {
	const titles: Record<string, string> = {
		'auth-missing': 'Authentication required',
		'auth-invalid': 'Invalid credentials',
		'auth-revoked': 'API key revoked',
	}
	return {
		type: `https://api.nike-release-checker.com/problems/${slug}`,
		title: titles[slug],
		status,
	}
}

async function _authPlugin(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
		// Routes that opt out of authentication set config.auth = 'anonymous'
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const routeConfig = (req.routeOptions as unknown as { config?: { auth?: string } }).config
		if (routeConfig?.auth === 'anonymous') return

		const header = req.headers['authorization'] ?? ''
		const bearerMatch = /^Bearer\s+(.+)$/i.exec(header)

		if (bearerMatch == null) {
			return reply
				.code(401)
				.header('WWW-Authenticate', 'Bearer realm="api"')
				.type('application/problem+json')
				.send(problem('auth-missing', 401))
		}

		const rawToken = bearerMatch[1]
		const tokenMatch = TOKEN_RE.exec(rawToken)

		if (tokenMatch == null) {
			return reply
				.code(401)
				.type('application/problem+json')
				.send(problem('auth-invalid', 401))
		}

		const keyId = tokenMatch[1]!
		const secret = tokenMatch[2]!

		const row = apiKeysDb.findByKeyId(keyId)

		// Always run argon2.verify to keep timing constant regardless of whether the key exists.
		const hashToCheck = row != null ? row.secret_hash : DUMMY_HASH
		let secretOk: boolean
		try {
			secretOk = await argon2Verify(hashToCheck, secret)
		} catch {
			// If the dummy hash format is wrong argon2 throws — treat as mismatch.
			secretOk = false
		}

		if (row == null || !secretOk) {
			return reply
				.code(401)
				.type('application/problem+json')
				.send(problem('auth-invalid', 401))
		}

		if (row.revoked_at != null) {
			return reply
				.code(403)
				.type('application/problem+json')
				.send(problem('auth-revoked', 403))
		}

		// Belt-and-braces: if the customer row is soft-deleted, treat token as revoked.
		const customer = customersDb.findById(row.customer_id)
		if (customer?.deleted_at != null) {
			return reply
				.code(401)
				.type('application/problem+json')
				.send(problem('auth-revoked', 401))
		}

		req.customerId = row.customer_id
		req.apiKeyId = row.key_id

		// Fire-and-forget: update last_used_at (non-blocking)
		apiKeysDb.touchLastUsed(row.key_id)
	})
}

export const authPlugin = fp(_authPlugin, { name: 'auth' })
