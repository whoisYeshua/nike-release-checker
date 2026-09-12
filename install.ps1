$ErrorActionPreference = 'Stop'

function Info  { param($m) Write-Host "==> $m" -ForegroundColor Green }
function Warn  { param($m) Write-Host "!! $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

$nodeMin = 24

# 1. Check Node
$needsNode = $true
try {
	$cur = (& node -p 'process.versions.node.split(".")[0]') -as [int]
	if ($cur -ge $nodeMin) { $needsNode = $false }
} catch {}

if ($needsNode) {
	Info "Installing Node.js $nodeMin via fnm..."
	if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
		iwr -useb 'https://fnm.vercel.app/install.ps1' | iex
	}
	& fnm install $nodeMin
	& fnm use $nodeMin
} else {
	Info "Node $(& node -v) OK"
}

# 2. Install bot
Info "Installing @nike-release-checker/bot..."
npm install -g '@nike-release-checker/bot'

# 3. Install Chromium
Info "Installing Chromium (Playwright)..."
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:LOCALAPPDATA\nike-bot\browsers"
npx playwright install chromium

Info "Install complete. Run: nike-bot init"
