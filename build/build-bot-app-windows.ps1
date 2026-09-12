# Build a self-contained Nike Bot folder + zip for Windows x64.
#
# Output: packages\bot\dist\nike-bot-<version>-windows-x64.zip
#
# Bundles Node + node_modules + Playwright Chromium. End user extracts and
# double-clicks "Nike Bot.cmd" to launch the interactive `init` wizard.

$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Bot  = Join-Path $Root 'packages\bot'
$Dist = Join-Path $Bot  'dist'
$Stage = Join-Path $Dist '_stage-win-x64'
$Out   = Join-Path $Dist 'nike-bot-windows-x64'
$NodeVersion = '24.15.0'
$Version = (Get-Content (Join-Path $Bot 'package.json') | ConvertFrom-Json).version

Write-Host "==> Build windows x64 v$Version"

if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
if (Test-Path $Out)   { Remove-Item $Out   -Recurse -Force }
New-Item -ItemType Directory -Path $Stage, $Out, (Join-Path $Stage 'app') | Out-Null

# 1. Stage bot + sdk
Copy-Item (Join-Path $Root 'packages\sdk') (Join-Path $Stage 'sdk') -Recurse
Remove-Item (Join-Path $Stage 'sdk\node_modules') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Bot 'src') (Join-Path $Stage 'app\src') -Recurse
if (Test-Path (Join-Path $Bot 'templates')) {
	Copy-Item (Join-Path $Bot 'templates') (Join-Path $Stage 'app\templates') -Recurse
}
Copy-Item (Join-Path $Bot 'bot.config.example.yaml') (Join-Path $Stage 'app\') -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Bot 'selectors.example.yaml')  (Join-Path $Stage 'app\') -ErrorAction SilentlyContinue

$pkgJson = Get-Content (Join-Path $Bot 'package.json') | ConvertFrom-Json
$pkgJson.dependencies | Add-Member -NotePropertyName '@nike-release-checker/sdk' -NotePropertyValue 'file:../sdk' -Force
$pkgJson.PSObject.Properties.Remove('devDependencies')
$pkgJson.PSObject.Properties.Remove('scripts')
$pkgJson | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $Stage 'app\package.json')

Write-Host '==> npm install --omit=dev'
Push-Location (Join-Path $Stage 'app')
npm install --omit=dev --no-audit --no-fund --loglevel=error
Pop-Location

Write-Host '==> Bundling src to app/main.mjs (esbuild)'
Push-Location (Join-Path $Stage 'app')
npm install --no-save --no-audit --no-fund --loglevel=error esbuild@0.27.0
$bundleScript = @"
const { build } = require('esbuild');
build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true, format: 'esm', platform: 'node', target: 'node24',
  outfile: 'main.mjs', jsx: 'automatic',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json'],
  external: ['playwright','playwright-core','patchright','patchright-core','better-sqlite3','react-devtools-core'],
  banner: { js: ""import { createRequire } from 'module'; const require = createRequire(import.meta.url);"" },
  logLevel: 'info',
}).catch(e => { console.error(e); process.exit(1); });
"@
node -e $bundleScript
Remove-Item 'src' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'node_modules\esbuild', 'node_modules\@esbuild' -Recurse -Force -ErrorAction SilentlyContinue
Pop-Location

# 2. Node binary
$NodeZip = "node-v$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZip"
$NodeCache = Join-Path $Dist '.node-cache'
New-Item -ItemType Directory -Path $NodeCache -Force | Out-Null
$NodeArchive = Join-Path $NodeCache $NodeZip
if (-not (Test-Path $NodeArchive)) { Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeArchive }
Expand-Archive -Path $NodeArchive -DestinationPath (Join-Path $Stage 'node-extract') -Force
$NodeExe = Join-Path $Stage "node-extract\node-v$NodeVersion-win-x64\node.exe"
if (-not (Test-Path $NodeExe)) { throw "Node.exe not found at $NodeExe" }

# 3. Playwright Chromium (must be installed on Windows runner)
Write-Host '==> Installing Playwright Chromium'
$env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path $Stage 'browsers')
& $NodeExe (Join-Path $Stage 'app\node_modules\playwright-core\cli.js') install chromium

# 4. Assemble
Copy-Item $NodeExe (Join-Path $Out 'node.exe')
Copy-Item (Join-Path $Stage 'app')      (Join-Path $Out 'app')      -Recurse
Copy-Item (Join-Path $Stage 'browsers') (Join-Path $Out 'browsers') -Recurse

@'
@echo off
setlocal
set HERE=%~dp0
set PLAYWRIGHT_BROWSERS_PATH=%HERE%browsers
if not defined NIKE_BOT_HOME set NIKE_BOT_HOME=%USERPROFILE%\.nike-bot
if not exist "%NIKE_BOT_HOME%" mkdir "%NIKE_BOT_HOME%"
cd /d "%NIKE_BOT_HOME%"
"%HERE%node.exe" --no-warnings "%HERE%app\main.mjs" %*
endlocal
'@ | Set-Content -Encoding ASCII (Join-Path $Out 'Nike Bot.cmd')

# Icon + desktop-style shortcut. A .cmd can't carry an icon, so we bundle the
# .ico and create a "Nike Bot.lnk" shortcut that points at the .cmd with the icon
# attached — that's what the user double-clicks. Drop your own build\windows\icon.ico
# (see build\make-icons.sh) to rebrand.
$IcoSrc = Join-Path $Root 'build\windows\icon.ico'
if (Test-Path $IcoSrc) {
	Copy-Item $IcoSrc (Join-Path $Out 'icon.ico')
	try {
		$ws = New-Object -ComObject WScript.Shell
		$lnk = $ws.CreateShortcut((Join-Path $Out 'Nike Bot.lnk'))
		$lnk.TargetPath = '%ComSpec%'
		$lnk.Arguments  = '/c ""%~dp0Nike Bot.cmd""'
		$lnk.WorkingDirectory = '%~dp0'
		$lnk.IconLocation = (Join-Path $Out 'icon.ico') + ',0'
		$lnk.Description = 'Nike Bot'
		$lnk.Save()
	} catch { Write-Host "  (shortcut creation skipped: $_)" }
}

@"
Nike Bot $Version (windows-x64)

Run:
  Double-click "Nike Bot.lnk"  (has the icon)   — or "Nike Bot.cmd"

This launches the interactive setup wizard. Self-contained — no Node, no npm,
no Playwright install needed.
"@ | Set-Content (Join-Path $Out 'README.txt')

Write-Host '==> Zipping'
$ZipPath = Join-Path $Dist "nike-bot-$Version-windows-x64.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path $Out -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host ''
Write-Host "Built: $ZipPath"
