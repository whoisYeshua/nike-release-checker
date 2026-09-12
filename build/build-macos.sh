#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./packages/bot/package.json').version")
DIST=packages/bot/dist

# 1. Bundle the JS + generate the SEA blob (from packages/bot so the relative
# paths in sea-config.json resolve correctly).
cd packages/bot
node scripts/bundle.mjs
node --experimental-sea-config sea-config.json
cd ../..

# 3. Build ARM64 + x64 variants
for ARCH in arm64 x64; do
	NODE_BIN_SRC=$(node -e "console.log(require.resolve('node'))" 2>/dev/null || which node)
	cp "$NODE_BIN_SRC" "$DIST/nike-bot-macos-$ARCH"
	codesign --remove-signature "$DIST/nike-bot-macos-$ARCH" || true
	npx postject "$DIST/nike-bot-macos-$ARCH" NODE_SEA_BLOB "$DIST/nike-bot.blob" \
		--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
		--macho-segment-name NODE_SEA
	codesign --force --sign - "$DIST/nike-bot-macos-$ARCH"
done

# 4. Merge into universal binary
lipo -create \
	"$DIST/nike-bot-macos-arm64" \
	"$DIST/nike-bot-macos-x64" \
	-output "$DIST/nike-bot"
codesign --force --sign - "$DIST/nike-bot"

# 5. Package into DMG
mkdir -p "$DIST/dmg-staging/nike-bot.app/Contents/MacOS"
cp "$DIST/nike-bot" "$DIST/dmg-staging/nike-bot.app/Contents/MacOS/"
cp build/macos/Info.plist "$DIST/dmg-staging/nike-bot.app/Contents/"
cp docs/FIRST_LAUNCH.md "$DIST/dmg-staging/"
hdiutil create -volname "Nike Bot" \
	-srcfolder "$DIST/dmg-staging" \
	-ov -format UDZO \
	"$DIST/nike-bot-v$VERSION-macos-universal.dmg"
