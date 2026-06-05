import { defineConfig } from '@rspack/cli'
import { rspack } from '@rspack/core'

import type { SwcLoaderOptions } from '@rspack/core'

export default defineConfig({
	entry: './src/index.tsx',
	target: 'node26.3',
	output: {
		filename: 'bundle.cjs',
		chunkFormat: 'commonjs',
		asyncChunks: false,
		clean: true,
	},
	devtool: false,
	optimization: { minimize: false },
	plugins: [
		new rspack.DefinePlugin({
			'process.env.DEV': false,
			'process.browser': false,
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
							// detectSyntax: 'auto', // allow omitting `parser: { syntax: 'typescript', tsx: true }`
							jsc: {
								parser: { syntax: 'typescript', tsx: true },
								transform: { react: { runtime: 'automatic' } },
							},
						} satisfies SwcLoaderOptions,
					},
				],
			},
		],
	},
})
