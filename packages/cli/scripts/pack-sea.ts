/**
 * Cross-platform SEA (Single Executable Application) build script.
 * Replaces pack-sea.sh (macOS) and pack-sea.ps1 (Windows).
 */
import { execFileSync, execSync } from 'node:child_process'
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')

/** Standard executable permission: rwxr-xr-x (owner rwx, group/others r-x). */
const SEA_BINARY_MODE = 0o755

const isWindows = process.platform === 'win32'
const isMacos = process.platform === 'darwin'

const distDir = path.join(projectRoot, 'dist')
const bundlePath = path.join(distDir, 'bundle.cjs')
const generatedSeaConfigPath = path.join(distDir, 'sea-config.generated.json')

// Build output filename based on platform/arch
const binaryName = isWindows
	? `nike-release-checker-win-${process.arch}.exe`
	: `nike-release-checker-macos-${process.arch}`
const exePath = path.join(distDir, binaryName)

const SEA_CONFIG = {
	main: './dist/bundle.cjs',
	output: exePath,
	mainFormat: 'commonjs',
	disableExperimentalSEAWarning: true,
	useSnapshot: false,
	useCodeCache: true,
	execArgv: ['--localstorage-file=local.db'],
}

// Clean previous artifacts
rmSync(exePath, { force: true })
rmSync(generatedSeaConfigPath, { force: true })

// Build bundle with rspack (via the existing "build" npm script)
console.log(`Building bundle to ${bundlePath}`)
execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
if (!existsSync(bundlePath)) {
	console.error(`Bundle not found at ${bundlePath}`)
	process.exit(1)
}

// Write SEA config file
const seaConfigContent = JSON.stringify(SEA_CONFIG, null, '\t')
writeFileSync(generatedSeaConfigPath, seaConfigContent)
console.log(`SEA config file written to ${generatedSeaConfigPath}`)
console.log(seaConfigContent)

// Build SEA executable (blob generation + injection in one step)
console.log(`Building SEA executable: ${exePath}`)
const nodeBin = process.execPath
execFileSync(nodeBin, ['--build-sea', generatedSeaConfigPath], {
	cwd: projectRoot,
	stdio: 'inherit',
})

// macOS: make executable and ad-hoc sign
if (isMacos) {
	chmodSync(exePath, SEA_BINARY_MODE)
	console.log('Ad-hoc signing SEA binary...')
	execFileSync('codesign', ['--sign', '-', '--force', '--timestamp=none', exePath], {
		stdio: 'inherit',
	})
}

console.log(`SEA executable ready at ${exePath}`)
