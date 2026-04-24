/**
 * Prepares native dependencies for the SEA runtime before the bundled app starts.
 *
 * This file is CommonJS JavaScript on purpose: rspack.config.ts imports the function,
 * serializes it with Function#toString(), and injects it as a raw banner. In SEA mode,
 * it extracts embedded native node_modules assets to a temp directory and repoints
 * require() there so externalized packages like sharp can load their .node/.dylib files.
 */
module.exports = function () {
	const { createRequire } = require('node:module')
	const sea = require('node:sea')

	if (!sea.isSea()) return

	const fs = require('node:fs')
	const os = require('node:os')
	const path = require('node:path')

	const assetPrefix = 'native/node_modules/'
	const assetKeys = sea.getAssetKeys().filter((key) => key.startsWith(assetPrefix))
	const exeStat = fs.statSync(process.execPath)
	const cacheKey = [
		process.platform,
		process.arch,
		process.version,
		exeStat.size,
		Math.trunc(exeStat.mtimeMs),
	].join('-')
	const nativeRoot = path.join(os.tmpdir(), 'nike-release-checker', 'sea-native', cacheKey)
	const nodeModulesRoot = path.join(nativeRoot, 'node_modules')
	const readyMarkerPath = path.join(nativeRoot, '.ready')

	if (!fs.existsSync(readyMarkerPath)) {
		fs.rmSync(nativeRoot, { recursive: true, force: true })
		fs.mkdirSync(nodeModulesRoot, { recursive: true })

		for (const assetKey of assetKeys) {
			const file = assetKey.slice(assetPrefix.length)
			const outputPath = path.join(nodeModulesRoot, file)
			fs.mkdirSync(path.dirname(outputPath), { recursive: true })
			fs.writeFileSync(outputPath, new Uint8Array(sea.getRawAsset(assetKey)))
		}

		fs.writeFileSync(readyMarkerPath, 'node_modules structure is ready')
	}

	require = createRequire(path.join(nodeModulesRoot, '.require-virtual-anchor.cjs'))
}
