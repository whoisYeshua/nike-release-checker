/**
 * Cross-platform SEA (Single Executable Application) build script.
 * Replaces pack-sea.sh (macOS) and pack-sea.ps1 (Windows).
 */
import { execFileSync, execSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import seaConfig from '../sea-config.json' with { type: 'json' }

const projectRoot = resolve(import.meta.dirname, '..')

/** Standard executable permission: rwxr-xr-x (owner rwx, group/others r-x). */
const SEA_BINARY_MODE = 0o755
/** Node.js SEA sentinel fuse string required by postject for blob injection. */
const NODE_SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const platform = process.platform
const arch = process.arch

const isWindows = () => platform === 'win32'
const isMacos = () => platform === 'darwin'

// Read sea-config.json to derive bundle and blob paths
const seaConfigPath = join(projectRoot, 'sea-config.json')
const distDir = join(projectRoot, 'dist')
const bundle = resolve(projectRoot, seaConfig.main)
const blob = resolve(projectRoot, seaConfig.output)

// Build output filename based on platform/arch
const binaryName = isWindows()
	? `nike-release-checker-win-${arch}.exe`
	: `nike-release-checker-macos-${arch}`
const outputBin = join(distDir, binaryName)

// Clean previous artifacts
mkdirSync(distDir, { recursive: true })
rmSync(blob, { force: true })
rmSync(outputBin, { force: true })

// Build bundle with rspack (via the existing "build" npm script)
console.log(`Building bundle to ${bundle}`)
execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })

// Verify bundle exists
if (!existsSync(bundle)) {
	console.error(`Bundle not found at ${bundle}`)
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
console.log(`Copying Node binary ${nodeBin} to ${outputBin}`)
cpSync(nodeBin, outputBin)

// macOS: strip existing code signature before injection
if (isMacos()) {
	console.log('Stripping existing code signature...')
	try {
		execFileSync('codesign', ['--remove-signature', outputBin], { stdio: 'inherit' })
	} catch {
		console.error('codesign not available, skipping code signature removal')
	}
}

// Inject SEA blob using postject programmatic API
console.log('Injecting SEA blob...')
const blobData = readFileSync(blob)
// @ts-expect-error postject could be load in this way
const { inject } = await import('postject')

const injectOptions: { sentinelFuse: string; machoSegmentName?: string } = {
	sentinelFuse: NODE_SEA_SENTINEL_FUSE,
}
if (isMacos()) {
	injectOptions.machoSegmentName = 'NODE_SEA'
}

await inject(outputBin, 'NODE_SEA_BLOB', blobData, injectOptions)

// macOS: make executable and ad-hoc sign
if (isMacos()) {
	chmodSync(outputBin, SEA_BINARY_MODE)
	console.log('Ad-hoc signing SEA binary...')
	execFileSync('codesign', ['--sign', '-', '--force', '--timestamp=none', outputBin], {
		stdio: 'inherit',
	})
}

console.log(`SEA executable ready at ${outputBin}`)
