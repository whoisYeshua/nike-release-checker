import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { validate as uuidValidate, v4 as uuidv4 } from 'uuid'

async function _requestIdPlugin(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', async (req) => {
		const incoming = req.headers['x-request-id']
		const incomingStr = Array.isArray(incoming) ? incoming[0] : incoming
		req.id = incomingStr != null && uuidValidate(incomingStr) ? incomingStr : uuidv4()
	})

	// After auth runs and req.customerId is set, bind it into the child logger
	// so every subsequent req.log.* call includes customer_id.
	app.addHook('preHandler', async (req) => {
		if (req.customerId != null) {
			req.log = req.log.child({ customer_id: req.customerId })
		}
	})

	app.addHook('onSend', async (req, reply, payload) => {
		reply.header('X-Request-Id', req.id)
		return payload
	})
}

export const requestIdPlugin = fp(_requestIdPlugin, { name: 'requestId' })
