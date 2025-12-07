import path from 'node:path'

import DailyRotateFile from 'winston-daily-rotate-file'
import { createLogger, format } from 'winston'

const logLevel = process.env.LOG_LEVEL ?? 'info'
const logFilePath = path.join(process.cwd(), 'cli-%DATE%.log')

const fileTransport = new DailyRotateFile({
	filename: logFilePath,
	maxSize: '50m',
})

export const logger = createLogger({
	level: logLevel,
	format: format.combine(
		format.timestamp(),
		format.printf(({ timestamp, level, message, scope = 'app', ...rest }) => {
			const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''
			return `${timestamp} [${scope}] ${level}: ${message}${meta}`
		})
	),
	// Keep payload lean; pino used `base: undefined`.
	defaultMeta: undefined,
	transports: [fileTransport],
})
