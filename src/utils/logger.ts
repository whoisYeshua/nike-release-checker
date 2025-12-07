import path from 'node:path'

import pino from 'pino'

const logFilePath = path.join(process.cwd(), 'cli.log')
const logLevel = process.env.LOG_LEVEL ?? 'info'

const transport = pino.transport({
	target: 'pino-roll',
	options: {
		file: logFilePath,
		frequency: 'daily',
		size: 50, // megabytes
		mkdir: true,
	},
})

export const logger = pino(
	{
		base: undefined,
		level: logLevel,
		timestamp: pino.stdTimeFunctions.isoTime,
		formatters: {
			level(label) {
				return { level: label }
			},
		},
	},
	transport
)
