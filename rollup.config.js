import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import copy from 'rollup-plugin-copy'
import replace from '@rollup/plugin-replace'

/** @type {import('rollup').RollupOptions} */
export default {
  input: 'src/index.tsx',
  output: {
    file: 'dist/index.js',
    format: 'es',
    generatedCode: 'es2015',
  },
  plugins: [
    replace({
      values: {
        "process.env['DEV']": false,
        'process.env.NODE_ENV': true,
      },
      delimiters: ['', ''],
    }),
    nodeResolve({
      exportConditions: ['node'], // add node option here,
      preferBuiltins: false,
    }),
    commonjs(),
    json(),
    typescript(),
    copy({
      targets: [
        {
          src: 'node_modules/yoga-wasm-web/dist/yoga.wasm',
          dest: 'dist',
        },
      ],
    }),
  ],
}
