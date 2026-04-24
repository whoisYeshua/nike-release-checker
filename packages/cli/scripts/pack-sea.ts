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
	relativePath: string
}

const toPosixPath = (value: string) => value.split(path.sep).join('/')

const listFilesRecursive = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(dir, entry.name)
		if (entry.isDirectory()) return listFilesRecursive(entryPath)
		if (entry.isFile()) return [entryPath]
		return []
	})

const packagePath = (packageName: string) => path.join(nodeModulesRoot, ...packageName.split('/'))

const addPackageAssets = (packageName: string, assets: NativeAsset[], required = true) => {
	const root = packagePath(packageName)
	if (!existsSync(root)) {
		if (!required) return
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
		assets.push({
			key: `native/node_modules/${relativePath}`,
			path: file,
			relativePath,
		})
	}
}

const getSharpRuntimePlatform = (): `${'darwin' | 'win32'}-${typeof process.arch}` => {
	if (isMacos()) return `darwin-${process.arch}`
	if (isWindows()) return `win32-${process.arch}`
	throw new Error(`Unsupported SEA build platform: ${process.platform}-${process.arch}`)
}

const createNativeAssets = () => {
	const runtimePlatform = getSharpRuntimePlatform()
	const assets: NativeAsset[] = []

	for (const packageName of ['sharp', 'detect-libc', 'semver', '@img/colour']) {
		addPackageAssets(packageName, assets)
	}

	addPackageAssets(`@img/sharp-${runtimePlatform}`, assets)
	addPackageAssets(`@img/sharp-libvips-${runtimePlatform}`, assets, false)

	return {
		assets: Object.fromEntries(assets.map((asset) => [asset.key, asset.path] as const)),
		count: assets.length,
		runtimePlatform,
	}
}

const { assets, count, runtimePlatform } = createNativeAssets()
console.log(`Bundling ${count} sharp native asset files for ${runtimePlatform}`)

writeFileSync(
	generatedSeaConfigPath,
	`${JSON.stringify(
		{
			...SEA_CONFIG,
			assets,
		},
		null,
		'\t'
	)}\n`
)

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
