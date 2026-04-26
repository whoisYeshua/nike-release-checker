import { defineConfig } from '@rspack/cli'
import { rspack } from '@rspack/core'

// @ts-expect-error no types
import seaNativeBootstrapFn from './scripts/sea-native-bootstrap.cjs'

const createStringIife = (fn: () => void) => `;(${fn.toString()})();`

export default defineConfig({
	entry: './src/index.tsx',
	target: 'node24.11',
	output: {
		filename: 'bundle.cjs',
		chunkFormat: 'commonjs',
	},
	devtool: false,
	optimization: { minimize: false },
	externalsType: 'commonjs',
	externals: {
		sharp: 'sharp',
	},
	/**
	 * Replace `node-fetch` with an empty module via `alias: false`.
	 *
	 * `ink-picture` (via `build/utils/image.js`) has a top-level static
	 * `import fetch from "node-fetch"`. We do not need that package: we always
	 * pass `<ProductImage />` a local path from `tmpdir()` — the HTTP branch
	 * `if (src.startsWith("http"))` is unreachable (remote images are fetched
	 * with Node 24’s global fetch, cached to disk in `src/store/product.ts`;
	 * ink-picture only receives the path).
	 *
	 * The static import would pull all of node-fetch@3 plus transitive deps
	 * (multipart-parser, fetch-blob, data-uri-to-buffer, formdata-polyfill)
	 * into the bundle; `body.js` also uses
	 * `await import('./utils/multipart-parser.js')`, so rspack splits that
	 * into a separate chunk `dist/<id>.bundle.cjs`.
	 *
	 * `alias: false` swaps the module for a stub (`fetch === undefined`)
	 * without throwing on init — unlike IgnorePlugin, which emits a throwing
	 * stub and fails on the top-level import before any code runs. Externals
	 * do not work: node-fetch@3 is ESM-only while output is CJS, so
	 * `require()` would break at runtime.
	 */
	resolve: {
		alias: { 'node-fetch': false },
	},
	plugins: [
		new rspack.BannerPlugin({
			banner: createStringIife(seaNativeBootstrapFn),
			raw: true,
			entryOnly: true,
		}),
		new rspack.DefinePlugin({
			'process.env.DEV': false,
			'process.browser': false,
			'process.env.ENVIRONMENT': JSON.stringify('NODE'),
		}),
	],
	module: {
		rules: [
			{
				test: /\.(jsx?|tsx?)$/,
				use: [
					{
						loader: 'builtin:swc-loader',
						options: {
							jsc: {
								parser: { syntax: 'typescript', tsx: true },
								transform: { react: { runtime: 'automatic' } },
							},
						},
					},
				],
			},
		],
	},
})
