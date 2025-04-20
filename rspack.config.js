import { defineConfig } from '@rspack/cli'
import { rspack } from '@rspack/core'

export default defineConfig({
	entry: './src/index.tsx',
	target: 'node22.14',
	output: {
		filename: 'bundle.cjs',
		chunkFormat: 'commonjs',
	},
	devtool: false,
	optimization: {
		minimize: false,
	},
	plugins: [
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
								parser: {
									syntax: 'typescript',
									tsx: true,
								},
								transform: {
									react: {
										runtime: 'automatic',
									},
								},
							},
						},
					},
				],
			},
		],
	},
})
