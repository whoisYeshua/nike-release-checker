import { maskProxy } from '../logger/credentialMasker.ts'
import { normalizeProxyInput } from '../config/proxyNormalize.ts'
import type { ProxyTestResult } from './auth.types.ts'

const PROBE_URL = 'https://www.nike.com/'
const TIMEOUT_MS = 10_000

export async function testProxyConnectivity(proxyUrl: string): Promise<ProxyTestResult> {
	const start = performance.now()
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

	try {
		const url = new URL(normalizeProxyInput(proxyUrl))
		const proxyAuth =
			url.username && url.password
				? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`
				: undefined

		// url.hostname is already de-bracketed for IPv6 (e.g. [::1] → ::1)
		// url.port is '' when not specified — fall back to protocol default
		const proxyHostname = url.hostname
		const defaultPort = url.protocol === 'https:' ? 443 : 80
		const proxyPort = url.port ? parseInt(url.port, 10) : defaultPort

		const response = await fetchThroughProxy(PROBE_URL, proxyHostname, proxyPort, proxyAuth, controller.signal)

		const latencyMs = Math.round(performance.now() - start)
		clearTimeout(timer)

		if (response >= 200 && response < 500) {
			return { success: true, latencyMs }
		}
		return { success: false, latencyMs, error: `HTTP ${response}` }
	} catch (err) {
		clearTimeout(timer)
		const latencyMs = Math.round(performance.now() - start)
		const raw = err instanceof Error ? err.message : String(err)
		const masked = maskProxy(raw.includes(proxyUrl) ? raw.replace(proxyUrl, maskProxy(proxyUrl)) : raw)
		return { success: false, latencyMs, error: masked }
	}
}

async function fetchThroughProxy(
	targetUrl: string,
	proxyHostname: string,
	proxyPort: number,
	proxyAuth: string | undefined,
	signal: AbortSignal,
): Promise<number> {
	const { connect } = await import('node:net')
	const { connect: tlsConnect } = await import('node:tls')

	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error('Request aborted'))
			return
		}

		let settled = false

		// resolveOnce / rejectOnce guard against double-settlement and clean up the abort listener
		const resolveOnce = (value: number) => {
			if (!settled) {
				settled = true
				signal.removeEventListener('abort', abortHandler)
				resolve(value)
			}
		}
		const rejectOnce = (err: Error) => {
			if (!settled) {
				settled = true
				signal.removeEventListener('abort', abortHandler)
				reject(err)
			}
		}

		const abortHandler = () => {
			socket.destroy()
			rejectOnce(new Error('Request aborted (timeout)'))
		}

		const target = new URL(targetUrl)
		const targetHost = target.hostname
		const targetPort = target.protocol === 'https:' ? 443 : 80

		const socket = connect(proxyPort, proxyHostname, () => {
			const connectHeaders = [
				`CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
				`Host: ${targetHost}:${targetPort}`,
				...(proxyAuth ? [`Proxy-Authorization: ${proxyAuth}`] : []),
				'',
				'',
			].join('\r\n')
			socket.write(connectHeaders)
		})

		socket.once('error', (err) => {
			socket.destroy()
			rejectOnce(err)
		})

		signal.addEventListener('abort', abortHandler)

		let buffer = ''
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString()

			if (!buffer.includes('\r\n\r\n')) return

			const statusLine = buffer.split('\r\n')[0] ?? ''
			const statusCode = parseInt(statusLine.split(' ')[1] ?? '0', 10)

			if (statusCode !== 200) {
				socket.destroy()
				resolveOnce(statusCode)
				return
			}

			// Tunnel established — do a quick HEAD request over TLS
			socket.removeAllListeners('data')
			const tlsSocket = tlsConnect({ socket, servername: targetHost }, () => {
				tlsSocket.write(
					['HEAD / HTTP/1.1', `Host: ${targetHost}`, 'Connection: close', '', ''].join('\r\n'),
				)
			})

			let tlsBuffer = ''
			tlsSocket.on('data', (tlsChunk: Buffer) => {
				tlsBuffer += tlsChunk.toString()
				// Wait for a complete status line before parsing
				const lineEnd = tlsBuffer.indexOf('\r\n')
				if (lineEnd === -1) return
				const firstLine = tlsBuffer.slice(0, lineEnd)
				const parts = firstLine.split(' ')
				const tlsStatus = parts.length >= 2 ? parseInt(parts[1]!, 10) : NaN
				if (isNaN(tlsStatus)) {
					tlsSocket.destroy()
					socket.destroy()
					rejectOnce(new Error(`Unexpected TLS status line: ${firstLine}`))
					return
				}
				tlsSocket.destroy()
				socket.destroy()
				resolveOnce(tlsStatus)
			})

			tlsSocket.on('error', (err) => {
				socket.destroy()
				rejectOnce(err)
			})
		})
	})
}
