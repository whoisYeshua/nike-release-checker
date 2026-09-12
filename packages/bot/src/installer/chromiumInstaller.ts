import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

export interface ProgressEvent {
	phase: 'download' | 'extract' | 'verify'
	percent: number
}

export interface InstallOptions {
	proxy?: string
	onProgress?: (e: ProgressEvent) => void
}

export type SpawnFactory = (
	command: string,
	args: readonly string[],
	options: SpawnOptions,
) => ChildProcess

let spawnFactory: SpawnFactory = nodeSpawn as SpawnFactory

export function setSpawnFactory(factory: SpawnFactory | null): void {
	spawnFactory = factory ?? (nodeSpawn as SpawnFactory)
}

export function browsersPath(): string {
	const base = process.platform === 'win32'
		? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'nike-bot', 'browsers')
		: join(homedir(), '.nike-bot', 'browsers')
	mkdirSync(base, { recursive: true })
	return base
}

export function isChromiumInstalled(): boolean {
	try {
		process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath()
		const exe = (chromium as unknown as { executablePath: () => string }).executablePath()
		return typeof exe === 'string' && exe.length > 0 && existsSync(exe)
	} catch {
		return false
	}
}

export function installChromium(opts: InstallOptions = {}): Promise<void> {
	return new Promise((resolve, reject) => {
		const path = browsersPath()
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PLAYWRIGHT_BROWSERS_PATH: path,
		}
		if (opts.proxy) {
			env.HTTPS_PROXY = opts.proxy
			env.HTTP_PROXY = opts.proxy
		}
		process.env.PLAYWRIGHT_BROWSERS_PATH = path

		const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
		const child = spawnFactory(cmd, ['playwright', 'install', 'chromium'], {
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		let stderrBuf = ''
		let lastPercent = -1

		const handleChunk = (chunk: Buffer | string) => {
			const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
			stderrBuf += text
			if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-4096)
			const matches = text.match(/(\d+)%/g)
			if (matches && opts.onProgress) {
				for (const m of matches) {
					const pct = Number.parseInt(m, 10)
					if (!Number.isNaN(pct) && pct !== lastPercent) {
						lastPercent = pct
						opts.onProgress({ phase: 'download', percent: pct })
					}
				}
			}
		}

		child.stderr?.on('data', handleChunk)
		child.stdout?.on('data', handleChunk)

		child.on('error', (err) => {
			reject(err)
		})

		child.on('close', (code) => {
			if (code === 0) {
				resolve()
			} else {
				const tail = stderrBuf.slice(-500)
				reject(new Error(`playwright install exited with code ${code}: ${tail.trim()}`))
			}
		})
	})
}
