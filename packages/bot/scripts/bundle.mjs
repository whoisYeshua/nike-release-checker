import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

await build({
	entryPoints: [fileURLToPath(new URL('../src/cli/index.ts', import.meta.url))],
	bundle: true,
	platform: 'node',
	target: 'node26',
	format: 'esm',
	outfile: fileURLToPath(new URL('../dist/nike-bot.bundle.mjs', import.meta.url)),
	banner: {
		js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
	},
	define: {
		'process.env.NODE_ENV': '"production"',
		__BOT_VERSION__: JSON.stringify(pkg.version),
	},
	external: [
		'playwright',
		'playwright-extra',
		'playwright-core',
		'patchright',
		'patchright-core',
		'rebrowser-playwright',
		'better-sqlite3',
		// ink/yoga-layout use top-level await + ESM; react-devtools-core is optional.
		// Keep them as externals so the CJS SEA bundle builds; CI install step provides node_modules.
		'ink',
		'ink-spinner',
		'ink-text-input',
		'ink-testing-library',
		'yoga-layout',
		'react-devtools-core',
	],
	loader: {
		'.ts': 'ts',
		'.tsx': 'tsx',
	},
	resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json'],
	jsx: 'automatic',
	minify: true,
	sourcemap: false,
	logLevel: 'info',
})
