import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

async function _errorHandlerPlugin(app: FastifyInstance): Promise<void> {
	app.setErrorHandler((error: Error & { statusCode?: number }, req, reply) => {
		const status = error.statusCode ?? 500
		const isProd = process.env['NODE_ENV'] === 'production'

		const body: Record<string, unknown> = {
			type: 'https://httpstatuses.com/' + String(status),
			title: error.name ?? 'Internal Server Error',
			status,
			request_id: req.id,
		}

		if (!isProd) {
			body['detail'] = error.message
		}

		req.log.error({ err: error, request_id: req.id }, 'Unhandled error')

		void reply.status(status).type('application/problem+json').send(body)
	})
}

export const errorHandlerPlugin = fp(_errorHandlerPlugin, { name: 'errorHandler' })
