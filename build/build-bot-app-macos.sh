#!/usr/bin/env bash
# Build Nike Bot.app for macOS (arm64 by default; pass --arch x64 for Intel).
#
# Output: packages/bot/dist/Nike Bot.app  (and a .dmg)
#
# Self-contained: bundles Node runtime, all node_modules (ink, playwright-extra,
# stealth, etc.) and the Playwright Chromium browser. End user double-clicks
# the .app -> a Terminal window opens -> the interactive `init` wizard runs.

set -euo pipefail

# ---- args -----------------------------------------------------------------
ARCH="arm64"
while [[ $# -gt 0 ]]; do
	case "$1" in
		--arch) ARCH="$2"; shift 2 ;;
		*) echo "unknown arg: $1" >&2; exit 2 ;;
	esac
done

case "$ARCH" in
	arm64|x64) ;;
	*) echo "--arch must be arm64 or x64" >&2; exit 2 ;;
esac

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BOT="$ROOT/packages/bot"
DIST="$BOT/dist"
APP="$DIST/Nike Bot.app"
STAGE="$DIST/_stage-$ARCH"
NODE_VERSION="24.15.0"

VERSION=$(node -p "require('$BOT/package.json').version")

echo "==> Build Nike Bot.app  arch=$ARCH  version=$VERSION"

rm -rf "$STAGE" "$APP" "$DIST/Nike Bot-$VERSION-macos-$ARCH.dmg"
mkdir -p "$STAGE" "$DIST"

# ---- 1. Stage bot + workspace SDK with a flat, prod-only node_modules ----
echo "==> Staging bot + sdk into $STAGE/app"
mkdir -p "$STAGE/app"

# Copy sdk source as a sibling so we can install it via file: protocol.
cp -R "$ROOT/packages/sdk" "$STAGE/sdk"
rm -rf "$STAGE/sdk/node_modules"

# Copy bot sources
cp -R "$BOT/src"        "$STAGE/app/src"
[[ -d "$BOT/templates" ]] && cp -R "$BOT/templates" "$STAGE/app/templates"
cp "$BOT/bot.config.example.yaml" "$STAGE/app/" 2>/dev/null || true
cp "$BOT/selectors.example.yaml"  "$STAGE/app/" 2>/dev/null || true
cp "$BOT/sea-config.json"         "$STAGE/app/" 2>/dev/null || true

# Synthesise a standalone package.json — strip workspace refs, point sdk at file:..
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$BOT/package.json','utf8'));
pkg.dependencies['@nike-release-checker/sdk'] = 'file:../sdk';
delete pkg.devDependencies;
delete pkg.scripts;
fs.writeFileSync('$STAGE/app/package.json', JSON.stringify(pkg, null, 2));
"

echo "==> Installing prod node_modules (npm)"
( cd "$STAGE/app" && npm install --omit=dev --no-audit --no-fund --loglevel=error )

# Bundle TS/TSX -> single ESM .mjs so Node runtime never sees .tsx (which
# --experimental-strip-types refuses to load). Native / heavy deps stay
# external and are resolved from the adjacent node_modules at runtime.
echo "==> Bundling src/ to app/main.mjs (esbuild)"
( cd "$STAGE/app" && npm install --no-save --no-audit --no-fund --loglevel=error esbuild@0.27.0 )

# Empty shim for react-devtools-core (optional ink dev-only dep that's not
# installed in production). Ink only requires it when DEV inspector is on.
mkdir -p "$STAGE/app/_shims"
echo "export default {}; export const connectToDevTools = () => {};" > "$STAGE/app/_shims/react-devtools-core.mjs"

( cd "$STAGE/app" && node -e "
const { build } = require('esbuild');
build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outfile: 'main.mjs',
  jsx: 'automatic',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json'],
  alias: { 'react-devtools-core': './_shims/react-devtools-core.mjs' },
  external: [
    'playwright', 'playwright-core',
    'patchright', 'patchright-core',
    'better-sqlite3',
  ],
  define: {
    'process.env.NODE_ENV': '\"production\"',
  },
  banner: { js: \"import { createRequire } from 'module'; const require = createRequire(import.meta.url); process.env.NODE_ENV = 'production';\" },
  logLevel: 'info',
}).catch(err => { console.error(err); process.exit(1); });
" )
rm -rf "$STAGE/app/src" "$STAGE/app/_shims"
rm -rf "$STAGE/app/node_modules/esbuild" "$STAGE/app/node_modules/@esbuild"

# ---- 2. Bundle Node runtime ----------------------------------------------
echo "==> Downloading Node v$NODE_VERSION ($ARCH)"
NODE_TARBALL="node-v$NODE_VERSION-darwin-$ARCH.tar.xz"
NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL"
NODE_CACHE="$DIST/.node-cache"
mkdir -p "$NODE_CACHE"
if [[ ! -f "$NODE_CACHE/$NODE_TARBALL" ]]; then
	curl -fL --progress-bar -o "$NODE_CACHE/$NODE_TARBALL" "$NODE_URL"
fi
mkdir -p "$STAGE/node-extract"
tar -xJf "$NODE_CACHE/$NODE_TARBALL" -C "$STAGE/node-extract"
NODE_BIN="$STAGE/node-extract/node-v$NODE_VERSION-darwin-$ARCH/bin/node"
test -x "$NODE_BIN"

# ---- 3. Install Playwright Chromium into the staging dir -----------------
echo "==> Installing Playwright Chromium into staging/browsers"
PLAYWRIGHT_BROWSERS_PATH="$STAGE/browsers" \
	"$NODE_BIN" "$STAGE/app/node_modules/playwright-core/cli.js" install chromium

# ---- 4. Assemble the .app bundle -----------------------------------------
echo "==> Assembling $APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$NODE_BIN" "$APP/Contents/Resources/node"
chmod +x "$APP/Contents/Resources/node"

cp -R "$STAGE/app"      "$APP/Contents/Resources/app"
cp -R "$STAGE/browsers" "$APP/Contents/Resources/browsers"

# Trim node_modules of obvious bloat to keep the .app smaller.
find "$APP/Contents/Resources/app/node_modules" \
	\( -name "*.md" -o -name "*.markdown" -o -name "LICENSE*" -o -name "CHANGELOG*" \
	   -o -name ".github" -o -name "test" -o -name "tests" -o -name "__tests__" \
	   -o -name "*.map" \) \
	-prune -exec rm -rf {} + 2>/dev/null || true

# run.command — script that the launcher hands to Terminal.app.
cat >"$APP/Contents/Resources/run.command" <<'RUNSH'
#!/bin/bash
set -e
RES="$(cd "$(dirname "$0")" && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="$RES/browsers"
export NIKE_BOT_HOME="$HOME/.nike-bot"
mkdir -p "$NIKE_BOT_HOME"
cd "$NIKE_BOT_HOME"
exec "$RES/node" --no-warnings "$RES/app/main.mjs" "$@"
RUNSH
chmod +x "$APP/Contents/Resources/run.command"

# Launcher — Contents/MacOS/nike-bot — opened by Finder when user double-clicks.
# It opens Terminal.app on run.command so ink (TUI) gets a real PTY.
cat >"$APP/Contents/MacOS/nike-bot" <<'LAUNCHSH'
#!/bin/bash
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
open -a Terminal "$RES/run.command"
LAUNCHSH
chmod +x "$APP/Contents/MacOS/nike-bot"

# Info.plist
cat >"$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>            <string>Nike Bot</string>
	<key>CFBundleDisplayName</key>     <string>Nike Bot</string>
	<key>CFBundleIdentifier</key>      <string>com.nike-release-checker.bot</string>
	<key>CFBundleVersion</key>         <string>$VERSION</string>
	<key>CFBundleShortVersionString</key><string>$VERSION</string>
	<key>CFBundlePackageType</key>     <string>APPL</string>
	<key>CFBundleExecutable</key>      <string>nike-bot</string>
	<key>CFBundleIconFile</key>        <string>AppIcon</string>
	<key>LSMinimumSystemVersion</key>  <string>11.0</string>
	<key>NSHighResolutionCapable</key> <true/>
</dict>
</plist>
PLIST

# Optional icon
if [[ -f "$ROOT/build/macos/icon.icns" ]]; then
	cp "$ROOT/build/macos/icon.icns" "$APP/Contents/Resources/AppIcon.icns"
fi

# ---- 5. Codesign (ad-hoc) ------------------------------------------------
echo "==> Codesigning ad-hoc"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || \
	codesign --force --deep --sign - "$APP"

# ---- 6. DMG --------------------------------------------------------------
echo "==> Building DMG"
DMG_STAGING="$DIST/.dmg-staging-$ARCH"
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"
cp -R "$APP" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Applications"

DMG_PATH="$DIST/Nike Bot-$VERSION-macos-$ARCH.dmg"
hdiutil create -volname "Nike Bot $VERSION" \
	-srcfolder "$DMG_STAGING" \
	-ov -format UDZO -fs HFS+ \
	"$DMG_PATH" >/dev/null

rm -rf "$DMG_STAGING"

echo
echo "✅ Built:"
echo "   $APP"
echo "   $DMG_PATH"
du -sh "$APP" "$DMG_PATH" | sed 's/^/   /'
