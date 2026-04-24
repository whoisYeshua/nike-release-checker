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
	 * `node-fetch` заменяем на пустой модуль через alias: false.
	 *
	 * `ink-picture` (через `build/utils/image.js`) делает статический
	 * `import fetch from "node-fetch"` на верхнем уровне. Нам этот пакет
	 * не нужен: мы всегда передаём в `<ProductImage />` локальный путь
	 * из `tmpdir()` — http-ветка `if (src.startsWith("http"))` недостижима
	 * (удалённые картинки скачиваются глобальным fetch Node 24 и кешируются
	 * на диск в `src/store/product.ts`, в ink-picture уходит только путь).
	 *
	 * Статический импорт тянет в бандл весь node-fetch@3 + транзитивки
	 * (multipart-parser, fetch-blob, data-uri-to-buffer, formdata-polyfill),
	 * причём body.js использует `await import('./utils/multipart-parser.js')`
	 * → rspack выделяет его в отдельный чанк dist/<id>.bundle.cjs.
	 *
	 * `alias: false` заменяет модуль пустышкой (fetch === undefined) без
	 * броска исключений при инициализации — в отличие от IgnorePlugin,
	 * который создаёт "throwing stub" и падает на верхнеуровневом импорте
	 * ещё до исполнения любого кода. externals не подходят: node-fetch@3
	 * ESM-only, а вывод CJS — require() сломается в рантайме.
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
