import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import webpack from 'webpack'
import CopyPlugin from 'copy-webpack-plugin'

const loadPackageJson = async () => {
  const json = await readFile(new URL('./package.json', import.meta.url))
  return JSON.parse(json.toString())
}

const { version: appVersion } = await loadPackageJson()

const projectRootFolder = fileURLToPath(new URL('.', import.meta.url))

/** @type {webpack.Configuration} */
export default {
  mode: 'production',
  entry: './src/index.tsx',
  target: 'node18.18',
  devtool: false,
  output: {
    path: path.resolve(projectRootFolder, 'dist'),
    filename: 'bundle.cjs',
    chunkFormat: 'commonjs',
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
  },
  externals: {
    'react-devtools-core': 'var react_devtools_core',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.DEV': false,
      'process.env.CI': JSON.stringify(false),
    }),
    new CopyPlugin({
      patterns: [{ from: 'node_modules/**/*.wasm', to: 'bin/[name][ext]' }],
    }),
  ],
  optimization: {
    minimize: false,
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        use: ['babel-loader'],
      },
      {
        test: /\.[jt]sx?$/,
        loader: 'string-replace-loader',
        options: {
          search: '__APP_VERSION__',
          replace: appVersion,
          flags: 'g',
        },
      },
    ],
  },
}
