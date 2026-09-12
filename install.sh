#!/usr/bin/env bash
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
log()  { echo "${GREEN}==>${NC} $1"; }
warn() { echo "${YELLOW}!!${NC} $1"; }
err()  { echo "${RED}ERROR${NC}: $1" >&2; exit 1; }

# 1. Detect OS + arch
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
	Darwin)  PLATFORM=macos ;;
	Linux)   PLATFORM=linux ;;
	*)       err "Unsupported OS: $OS (Windows: use install.ps1)" ;;
esac
log "Detected: $PLATFORM $ARCH"

# 2. Ensure curl (self-check; script runs via curl anyway)
command -v curl >/dev/null || err "curl is required (install via your package manager)"

# 3. Ensure Node 24+ via nvm
NODE_MIN=24
if ! command -v node >/dev/null || \
	 [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MIN" ]; then
	log "Installing Node.js $NODE_MIN via nvm..."
	if ! command -v nvm >/dev/null; then
		curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
		# shellcheck disable=SC1090
		export NVM_DIR="$HOME/.nvm"
		. "$NVM_DIR/nvm.sh"
	fi
	nvm install $NODE_MIN
	nvm use $NODE_MIN
else
	log "Node $(node -v) OK"
fi

# 4. Install the bot
log "Installing @nike-release-checker/bot..."
npm install -g @nike-release-checker/bot

# 5. Install Playwright Chromium
log "Installing Chromium (Playwright)..."
PLAYWRIGHT_BROWSERS_PATH="$HOME/.nike-bot/browsers" \
	npx playwright install chromium

# 6. Done
log "${GREEN}Install complete.${NC}"
log "Run: ${GREEN}nike-bot init${NC} to get started"
