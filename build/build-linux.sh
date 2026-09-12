#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./packages/bot/package.json').version")
DIST=packages/bot/dist

mkdir -p "$DIST"

# 1. Bundle the JS + generate the SEA blob
cd packages/bot
node scripts/bundle.mjs
node --experimental-sea-config sea-config.json
cd ../..

# 2. Build Linux x64 executable
NODE_BIN_SRC=$(node -e "console.log(require.resolve('node'))" 2>/dev/null || which node)
cp "$NODE_BIN_SRC" "$DIST/nike-bot-linux-x64"

# 3. Inject SEA blob
npx postject "$DIST/nike-bot-linux-x64" NODE_SEA_BLOB "$DIST/nike-bot.blob" \
	--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

chmod +x "$DIST/nike-bot-linux-x64"

# 4. Create README and tar.gz package
cat > "$DIST/README-linux.txt" << EOF
Nike Bot v$VERSION (Linux x64)

Usage:
  ./nike-bot-linux-x64

This is a standalone binary executable with interactive terminal UI.
EOF

tar -czf "$DIST/nike-bot-v$VERSION-linux-x64.tar.gz" -C "$DIST" "nike-bot-linux-x64" "README-linux.txt"

echo "✅ Linux build complete: $DIST/nike-bot-linux-x64 & $DIST/nike-bot-v$VERSION-linux-x64.tar.gz"
