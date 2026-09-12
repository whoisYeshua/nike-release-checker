#!/usr/bin/env bash
# Build a self-contained Nike Bot tarball for Linux (x64 by default; --arch arm64).
#
# Output: packages/bot/dist/nike-bot-<version>-linux-<arch>.tar.gz
#
# Bundles Node + node_modules + Playwright Chromium. End user extracts and
# runs ./nike-bot.sh -- a real terminal is already attached on Linux so the
# interactive `init` wizard works directly (no launcher trick needed).

set -euo pipefail

ARCH="x64"
while [[ $# -gt 0 ]]; do
	case "$1" in
		--arch) ARCH="$2"; shift 2 ;;
		*) echo "unknown arg: $1" >&2; exit 2 ;;
	esac
done
case "$ARCH" in x64|arm64) ;; *) echo "--arch must be x64 or arm64" >&2; exit 2 ;; esac

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BOT="$ROOT/packages/bot"
DIST="$BOT/dist"
STAGE="$DIST/_stage-linux-$ARCH"
OUT="$DIST/nike-bot-linux-$ARCH"
NODE_VERSION="24.15.0"
VERSION=$(node -p "require('$BOT/package.json').version")

echo "==> Build linux $ARCH  v$VERSION"

rm -rf "$STAGE" "$OUT" "$DIST/nike-bot-$VERSION-linux-$ARCH.tar.gz"
mkdir -p "$STAGE" "$OUT"

# 1. Stage bot + sdk
cp -R "$ROOT/packages/sdk" "$STAGE/sdk"
rm -rf "$STAGE/sdk/node_modules"
mkdir -p "$STAGE/app"
cp -R "$BOT/src" "$STAGE/app/src"
[[ -d "$BOT/templates" ]] && cp -R "$BOT/templates" "$STAGE/app/templates"
cp "$BOT/bot.config.example.yaml" "$STAGE/app/" 2>/dev/null || true
cp "$BOT/selectors.example.yaml"  "$STAGE/app/" 2>/dev/null || true

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$BOT/package.json','utf8'));
pkg.dependencies['@nike-release-checker/sdk'] = 'file:../sdk';
delete pkg.devDependencies; delete pkg.scripts;
fs.writeFileSync('$STAGE/app/package.json', JSON.stringify(pkg, null, 2));
"

echo "==> npm install --omit=dev"
( cd "$STAGE/app" && npm install --omit=dev --no-audit --no-fund --loglevel=error )

echo "==> Bundling src/ to app/main.mjs (esbuild)"
( cd "$STAGE/app" && npm install --no-save --no-audit --no-fund --loglevel=error esbuild@0.27.0 )
( cd "$STAGE/app" && node -e "
const { build } = require('esbuild');
build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true, format: 'esm', platform: 'node', target: 'node24',
  outfile: 'main.mjs', jsx: 'automatic',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json'],
  external: ['playwright','playwright-core','patchright','patchright-core','better-sqlite3','react-devtools-core'],
  banner: { js: \"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\" },
  logLevel: 'info',
}).catch(e => { console.error(e); process.exit(1); });
" )
rm -rf "$STAGE/app/src" "$STAGE/app/node_modules/esbuild" "$STAGE/app/node_modules/@esbuild"

# 2. Node binary
NODE_TARBALL="node-v$NODE_VERSION-linux-$ARCH.tar.xz"
NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL"
NODE_CACHE="$DIST/.node-cache"; mkdir -p "$NODE_CACHE"
[[ -f "$NODE_CACHE/$NODE_TARBALL" ]] || curl -fL --progress-bar -o "$NODE_CACHE/$NODE_TARBALL" "$NODE_URL"
mkdir -p "$STAGE/node-extract"
tar -xJf "$NODE_CACHE/$NODE_TARBALL" -C "$STAGE/node-extract"
NODE_BIN="$STAGE/node-extract/node-v$NODE_VERSION-linux-$ARCH/bin/node"
test -x "$NODE_BIN"

# 3. Playwright Chromium (only works natively on Linux runners)
echo "==> Installing Playwright Chromium"
PLAYWRIGHT_BROWSERS_PATH="$STAGE/browsers" \
	"$NODE_BIN" "$STAGE/app/node_modules/playwright-core/cli.js" install chromium

# 4. Assemble
cp "$NODE_BIN" "$OUT/node"
chmod +x "$OUT/node"
cp -R "$STAGE/app"      "$OUT/app"
cp -R "$STAGE/browsers" "$OUT/browsers"

cat >"$OUT/nike-bot.sh" <<'RUNSH'
#!/usr/bin/env bash
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="$HERE/browsers"
export NIKE_BOT_HOME="${NIKE_BOT_HOME:-$HOME/.nike-bot}"
mkdir -p "$NIKE_BOT_HOME"
cd "$NIKE_BOT_HOME"
exec "$HERE/node" --no-warnings "$HERE/app/main.mjs" "$@"
RUNSH
chmod +x "$OUT/nike-bot.sh"

cat >"$OUT/README.txt" <<TXT
Nike Bot $VERSION (linux-$ARCH)

Run:
  ./nike-bot.sh

This launches the interactive setup wizard. Self-contained — no Node, no npm,
no Playwright install needed.
TXT

echo "==> tar.gz"
( cd "$DIST" && tar -czf "nike-bot-$VERSION-linux-$ARCH.tar.gz" "nike-bot-linux-$ARCH" )

echo
echo "✅ Built: $DIST/nike-bot-$VERSION-linux-$ARCH.tar.gz"
du -sh "$OUT" "$DIST/nike-bot-$VERSION-linux-$ARCH.tar.gz" | sed 's/^/   /'
