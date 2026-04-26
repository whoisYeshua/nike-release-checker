/**
 * Cross-platform SEA (Single Executable Application) build script.
 * Replaces pack-sea.sh (macOS) and pack-sea.ps1 (Windows).
 */
import { execFileSync, execSync } from 'node:child_process'
import {
	chmodSync,
	cpSync,
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import path from 'node:path'

import sharpPackage from 'sharp/package.json' with { type: 'json' }

const SHARP_DEPENDENCIES = Object.keys(sharpPackage.dependencies)
const SHARP_OPTIONAL_DEPENDENCIES = Object.keys(sharpPackage.optionalDependencies)

const projectRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(projectRoot, '../..')
const nodeModulesRoot = path.join(repoRoot, 'node_modules')

/** Standard executable permission: rwxr-xr-x (owner rwx, group/others r-x). */
const SEA_BINARY_MODE = 0o755
/** Node.js SEA sentinel fuse string required by postject for blob injection. */
const NODE_SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const SEA_CONFIG = {
	main: './dist/bundle.cjs',
	output: './dist/sea-prep.blob',
	disableExperimentalSEAWarning: true,
	useSnapshot: false,
	useCodeCache: true,
	execArgv: ['--experimental-webstorage', '--localstorage-file=local.db'],
}

const isWindows = () => process.platform === 'win32'
const isMacos = () => process.platform === 'darwin'

const distDir = path.join(projectRoot, 'dist')
const bundlePath = path.resolve(projectRoot, SEA_CONFIG.main)
const outputBlobPath = path.resolve(projectRoot, SEA_CONFIG.output)
const generatedSeaConfigPath = path.join(distDir, 'sea-config.generated.json')

// Build output filename based on platform/arch
const binaryName = isWindows()
	? `nike-release-checker-win-${process.arch}.exe`
	: `nike-release-checker-macos-${process.arch}`
const exePath = path.join(distDir, binaryName)

// Clean previous artifacts
rmSync(outputBlobPath, { force: true })
rmSync(exePath, { force: true })
rmSync(generatedSeaConfigPath, { force: true })

// Build bundle with rspack (via the existing "build" npm script)
console.log(`Building bundle to ${bundlePath}`)
execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
if (!existsSync(bundlePath)) {
	console.error(`Bundle not found at ${bundlePath}`)
	process.exit(1)
}

interface NativeAsset {
	key: string
	path: string
}

/** Converts platform paths to SEA asset keys, e.g. `sharp\lib\index.js` -> `sharp/lib/index.js`. */
const toPosixPath = (value: string) => value.split(path.sep).join('/')

const listFilesRecursive = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(dir, entry.name)
		if (entry.isDirectory()) return listFilesRecursive(entryPath)
		if (entry.isFile()) return [entryPath]
		return []
	})

/** Resolves a package name to workspace node_modules, e.g. `@img/colour` -> `<repo>/node_modules/@img/colour`. */
const packagePath = (packageName: string) => path.join(nodeModulesRoot, ...packageName.split('/'))

/** Collects all files from a package and maps them to native/node_modules SEA assets. */
const getPackageAssets = (packageName: string, required = true) => {
	const result: NativeAsset[] = []
	const root = packagePath(packageName)
	if (!existsSync(root)) {
		if (!required) return result
		throw new Error(
			`Required native package "${packageName}" is not installed. Run npm install --include=optional before building SEA.`
		)
	}

	const files = listFilesRecursive(root)
	if (files.length === 0 && required) {
		throw new Error(`Required native package "${packageName}" does not contain files`)
	}

	for (const file of files) {
		const relativePath = toPosixPath(path.relative(nodeModulesRoot, file))
		result.push({
			key: `native/node_modules/${relativePath}`,
			path: file,
		})
	}
	return result
}
const getOptionalPackageAssets = (packageName: string) => getPackageAssets(packageName, false)

/** Builds the SEA assets map needed for sharp and its installed runtime dependencies. */
const createNativeAssets = () => {
	let assets: NativeAsset[] = []

	for (const packageName of ['sharp', ...SHARP_DEPENDENCIES]) {
		const results = getPackageAssets(packageName)
		assets = assets.concat(results)
	}

	for (const packageName of SHARP_OPTIONAL_DEPENDENCIES) {
		const results = getOptionalPackageAssets(packageName)
		assets = assets.concat(results)
	}

	return Object.fromEntries(assets.map((asset) => [asset.key, asset.path] as const))
}

const assets = createNativeAssets()

// Write SEA config file
const seaConfigContent = JSON.stringify({ ...SEA_CONFIG, assets }, null, '\t')
writeFileSync(generatedSeaConfigPath, seaConfigContent)
console.log(`SEA config file written to ${generatedSeaConfigPath}`)
console.log(seaConfigContent)

// Generate SEA blob
console.log(`Generating SEA blob using config file ${generatedSeaConfigPath}`)
const nodeBin = process.execPath
execFileSync(nodeBin, ['--experimental-sea-config', generatedSeaConfigPath], {
	cwd: projectRoot,
	stdio: 'inherit',
})

// Copy Node binary
console.log(`Copying Node binary ${nodeBin} to ${exePath}`)
cpSync(nodeBin, exePath)

// macOS: strip existing code signature before injection
if (isMacos()) {
	console.log('Stripping existing code signature...')
	try {
		execFileSync('codesign', ['--remove-signature', exePath], { stdio: 'inherit' })
	} catch {
		console.error('codesign not available, skipping code signature removal')
	}
}

// Inject SEA blob using postject programmatic API
console.log('Injecting SEA blob...')
// @ts-expect-error postject could be load in this way
const { inject } = await import('postject')

const injectOptions = {
	sentinelFuse: NODE_SEA_SENTINEL_FUSE,
	...(isMacos() && { machoSegmentName: 'NODE_SEA' }),
}

const blobBuffer = readFileSync(outputBlobPath)
await inject(exePath, 'NODE_SEA_BLOB', blobBuffer, injectOptions)

// macOS: make executable and ad-hoc sign
if (isMacos()) {
	chmodSync(exePath, SEA_BINARY_MODE)
	console.log('Ad-hoc signing SEA binary...')
	execFileSync('codesign', ['--sign', '-', '--force', '--timestamp=none', exePath], {
		stdio: 'inherit',
	})
}

console.log(`SEA executable ready at ${exePath}`)
