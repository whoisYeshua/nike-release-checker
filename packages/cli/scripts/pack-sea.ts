/**
 * Cross-platform SEA (Single Executable Application) build script.
 * Replaces pack-sea.sh (macOS) and pack-sea.ps1 (Windows).
 */
import { execFileSync, execSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import seaConfig from '../sea-config.json' with { type: 'json' }

const projectRoot = path.resolve(import.meta.dirname, '..')

/** Standard executable permission: rwxr-xr-x (owner rwx, group/others r-x). */
const SEA_BINARY_MODE = 0o755
/** Node.js SEA sentinel fuse string required by postject for blob injection. */
const NODE_SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const isWindows = () => process.platform === 'win32'
const isMacos = () => process.platform === 'darwin'

// Read sea-config.json to derive bundle and blob paths
const seaConfigPath = path.join(projectRoot, 'sea-config.json')
const distDir = path.join(projectRoot, 'dist')
const bundlePath = path.resolve(projectRoot, seaConfig.main)
const outputBlobPath = path.resolve(projectRoot, seaConfig.output)

// Build output filename based on platform/arch
const binaryName = isWindows()
	? `nike-release-checker-win-${process.arch}.exe`
	: `nike-release-checker-macos-${process.arch}`
const exePath = path.join(distDir, binaryName)

// Clean previous artifacts
rmSync(outputBlobPath, { force: true })
rmSync(exePath, { force: true })

// Build bundle with rspack (via the existing "build" npm script)
console.log(`Building bundle to ${bundlePath}`)
execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
if (!existsSync(bundlePath)) {
	console.error(`Bundle not found at ${bundlePath}`)
	process.exit(1)
}

// Generate SEA blob
console.log(`Generating SEA blob using config file ${seaConfigPath}`)
const nodeBin = process.execPath
execFileSync(nodeBin, ['--experimental-sea-config', seaConfigPath], {
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
