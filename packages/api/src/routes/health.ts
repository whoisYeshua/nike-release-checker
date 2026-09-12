import type { FastifyInstance } from 'fastify'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function getVersion(): string {
	if (process.env['APP_VERSION'] != null) return process.env['APP_VERSION']
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const pkg = require('../../../package.json') as { version: string }
		return pkg.version
	} catch {
		return '0.0.0'
	}
}

const VERSION = getVersion()

const healthSchema = {
	response: {
		200: {
			type: 'object',
			properties: {
				status: { type: 'string' },
				uptime: { type: 'number' },
				version: { type: 'string' },
			},
			required: ['status', 'uptime', 'version'],
		},
	},
} as const

export async function healthRoute(app: FastifyInstance): Promise<void> {
	app.get('/healthz', { schema: healthSchema, config: { auth: 'anonymous' } }, async (_req, reply) => {
		await reply.send({
			status: 'ok',
			uptime: process.uptime(),
			version: VERSION,
		})
	})
}
