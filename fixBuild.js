import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import config from './webpack.config.js'

// Path to webpack output file
const bundleFilePath = join(config.output.path, config.output.filename)

try {
  // Read the file using promises
  const data = await readFile(bundleFilePath, 'utf8')

  // Replacement logic
  const result = data.replace(
    /\(\d,node_module__WEBPACK_IMPORTED_MODULE_1__.createRequire.*resolve\(".\/yoga.wasm"\)/g,
    'require.resolve("./bin/yoga.wasm")'
  )

  // Write the file back
  await writeFile(bundleFilePath, result, 'utf8')
  console.log('Replacement completed successfully.')
} catch (err) {
  console.error('Error occurred:', err)
}
