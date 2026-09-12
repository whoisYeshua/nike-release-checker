import { createInterface } from 'node:readline'

/**
 * Prompt the user for a passphrase on stdin, suppressing terminal echo so the
 * typed value does not appear on screen (and is not captured by terminal
 * scrollback). If stdin is not a TTY, echo suppression is a no-op — callers
 * should avoid piping passphrases through non-interactive streams anyway.
 */
interface RawIn {
	setRawMode?: (raw: boolean) => void
	resume: () => void
	pause: () => void
	setEncoding: (enc: string) => void
	on: (evt: string, fn: (c: string) => void) => void
	once: (evt: string, fn: () => void) => void
	removeListener: (evt: string, fn: (c: string) => void) => void
}

/** Raw-mode char reader with echo suppression. Resolves on Enter/Ctrl-D, rejects on Ctrl-C. */
function readSecretRaw(input: RawIn): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const chunks: string[] = []
		try { input.setRawMode?.(true) } catch {}
		input.resume()
		input.setEncoding('utf8')
		const cleanup = () => {
			try { input.setRawMode?.(false) } catch {}
			input.removeListener('data', onData)
			input.pause()
		}
		const onData = (chunk: string) => {
			for (const ch of chunk) {
				const code = ch.charCodeAt(0)
				if (ch === '\n' || ch === '\r' || code === 4) { cleanup(); process.stdout.write('\n'); resolve(chunks.join('')); return }
				if (code === 3) { cleanup(); process.stdout.write('\n'); reject(new Error('Passphrase prompt aborted')); return }
				if (code === 127 || code === 8) { chunks.pop(); continue }
				chunks.push(ch)
			}
		}
		input.on('data', onData)
		// Piped/closed stream → resolve empty rather than hang or exit the process.
		input.once('end', () => { cleanup(); resolve(chunks.join('')) })
	})
}

export async function promptPassphrase(label = 'Passphrase: '): Promise<string> {
	process.stdout.write(label)

	// PREFER a FRESH /dev/tty handle. After an ink TUI (the home menu) tears down,
	// `process.stdin` can be left paused/ended — reading from it then made this
	// prompt exit the WHOLE process (the bot window just closed). /dev/tty is an
	// independent handle to the controlling terminal, immune to that teardown.
	if (process.platform !== 'win32') {
		try {
			const fs = await import('node:fs')
			const tty = await import('node:tty')
			const fd = fs.openSync('/dev/tty', 'r')
			if (!tty.isatty(fd)) { fs.closeSync(fd); throw new Error('not a tty') }
			const input = new tty.ReadStream(fd) as unknown as RawIn & { destroy: () => void }
			try {
				return await readSecretRaw(input)
			} finally {
				try { input.destroy() } catch {}
				try { fs.closeSync(fd) } catch {}
			}
		} catch {
			// fall through to process.stdin
		}
	}

	// Fallback: process.stdin in raw mode (Windows, or /dev/tty unavailable).
	const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (raw: boolean) => void; readableEnded?: boolean }
	if (stdin.isTTY && typeof stdin.setRawMode === 'function' && !stdin.readableEnded) {
		return readSecretRaw(stdin as unknown as RawIn)
	}

	// Non-interactive / ended stream → don't hang or exit; return empty.
	if (stdin.readableEnded || !stdin.readable) { process.stdout.write('\n'); return '' }

	// Last resort: readline with echo-suppressing stdout shim.
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
	return new Promise<string>((resolve) => {
		const origWrite = process.stdout.write.bind(process.stdout)
		;(process.stdout as unknown as { write: (chunk: unknown, ...rest: unknown[]) => boolean }).write = (
			chunk: unknown,
			...rest: unknown[]
		) => {
			if (typeof chunk === 'string' && chunk !== '\n' && chunk !== label) return true
			return origWrite(chunk as string, ...(rest as []))
		}
		rl.question('', (answer: string) => {
			;(process.stdout as unknown as { write: typeof origWrite }).write = origWrite
			process.stdout.write('\n')
			rl.close()
			resolve(answer)
		})
	})
}

/**
 * Prompt for a free-form answer (no echo suppression). Used for confirmations.
 */
export async function promptLine(label: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
	return new Promise<string>((resolve) => {
		rl.question(label, (answer: string) => {
			rl.close()
			resolve(answer)
		})
	})
}
