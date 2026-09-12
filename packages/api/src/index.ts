import { buildApp } from './app.ts'

const port = Number(process.env['PORT'] ?? 8080)
const app = await buildApp()
await app.listen({ port, host: '0.0.0.0' })

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
	process.on(sig, async () => {
		await app.close()
		process.exit(0)
	})
}
