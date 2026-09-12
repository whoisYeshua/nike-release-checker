import { access, readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import * as v from 'valibot'
import { BotConfigSchema, type BotConfig } from './botConfigSchema.ts'

const DEFAULT_CONFIG_PATH = './bot.config.yaml'

export async function loadBotConfig(configPath?: string): Promise<BotConfig> {
	const isExplicit = configPath !== undefined
	const resolvedPath = configPath ?? DEFAULT_CONFIG_PATH

	const exists = await access(resolvedPath)
		.then(() => true)
		.catch(() => false)

	if (!exists) {
		if (isExplicit) {
			throw new Error(`Configuration file not found: ${resolvedPath}`)
		}
		return v.parse(BotConfigSchema, {})
	}

	const raw = await readFile(resolvedPath, 'utf-8')
	const parsed = parse(raw) as unknown

	try {
		return v.parse(BotConfigSchema, parsed)
	} catch (err) {
		if (err instanceof v.ValiError) {
			const flat = v.flatten(err.issues)
			const messages = Object.entries(flat.nested ?? {})
				.map(([path, msgs]) => `  - ${path}: ${(msgs as string[]).join(', ')}`)
				.join('\n')
			throw new Error(`Invalid configuration in ${resolvedPath}:\n${messages || err.message}`)
		}
		throw err
	}
}
