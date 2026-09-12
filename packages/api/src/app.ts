import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import fastifyWebsocket from '@fastify/websocket'
import Fastify from 'fastify'

import { authPlugin } from './plugins/auth.ts'
import { errorHandlerPlugin } from './plugins/errorHandler.ts'
import { rateLimitPlugin } from './plugins/rateLimit.ts'
import { requestIdPlugin } from './plugins/requestId.ts'
import { dropEventsRoute } from './routes/dropEvents.ts'
import { dropsRoutes } from './routes/drops/index.ts'
import { healthRoute } from './routes/health.ts'
import { accountRoutes } from './routes/account/index.ts'
import { cardsRoutes } from './routes/account/cards.ts'
import { nikeAccountsRoutes } from './routes/account/nikeAccounts.ts'
import { webhooksRoutes } from './routes/webhooks/index.ts'
import { gdprRoutes } from './routes/account/gdpr.ts'
import { startGdprPurger, stopGdprPurger } from './workers/gdprPurger.ts'
import { createDropScheduler } from './scheduler/dropScheduler.ts'
import { NoopWorkerPoolClient } from './scheduler/workerPoolClient.ts'

export async function buildApp() {
	const app = Fastify({
		logger: {
			level: process.env['LOG_LEVEL'] ?? 'info',
			serializers: {
				req(req) {
					return {
						method: req.method,
						url: req.url,
						// Redact authorization header
						headers: Object.fromEntries(
							Object.entries(req.headers as Record<string, unknown>).filter(
								([k]) => k.toLowerCase() !== 'authorization',
							),
						),
					}
				},
				res(reply) {
					return { statusCode: reply.statusCode }
				},
			},
		},
		genReqId: () => {
			// Will be overwritten by requestIdPlugin after reading headers
			return ''
		},
		disableRequestLogging: false,
	})

	// Plugins
	await app.register(fastifyWebsocket)
	await app.register(errorHandlerPlugin)
	await app.register(requestIdPlugin)
	await app.register(authPlugin)
	await app.register(rateLimitPlugin)

	// OpenAPI
	await app.register(fastifySwagger, {
		openapi: {
			openapi: '3.1.0',
			info: {
				title: 'Nike Bot API',
				version: '0.1.0',
				description: 'B2B REST API gateway for Nike drop orchestration',
			},
		},
	})

	await app.register(fastifySwaggerUi, {
		routePrefix: '/docs',
	})

	// Expose raw OpenAPI JSON (anonymous — same as /docs/* swagger UI)
	app.get('/docs/openapi.json', { config: { auth: 'anonymous' } }, async (_req, reply) => {
		await reply.send(app.swagger())
	})

	// Routes
	await app.register(dropEventsRoute)
	await app.register(healthRoute)
	await app.register(webhooksRoutes)
	await app.register(dropsRoutes)
	await app.register(accountRoutes)
	await app.register(cardsRoutes)
	await app.register(nikeAccountsRoutes)
	await app.register(gdprRoutes)

	// Scheduler lifecycle — start on ready, stop on close
	const scheduler = createDropScheduler({ workerPool: new NoopWorkerPoolClient() })
	app.addHook('onReady', async () => {
		await scheduler.start()
		startGdprPurger()
	})
	app.addHook('onClose', async () => {
		await scheduler.stop()
		stopGdprPurger()
	})

	return app
}
