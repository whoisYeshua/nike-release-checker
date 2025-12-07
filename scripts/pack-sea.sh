#!/usr/bin/env bash
# Build and pack the SEA executable for macOS arm64.
set -euo pipefail

# Paths and inputs
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
BUNDLE="${DIST_DIR}/bundle.cjs"
BLOB="${DIST_DIR}/sea-prep.blob"
OUTPUT_BIN="${DIST_DIR}/nike-release-checker-macos-arm64"
NODE_BIN="$(command -v node)"

# Clean previous artifacts
mkdir -p "${DIST_DIR}"
rm -f "${BLOB}" "${OUTPUT_BIN}"

echo "Building bundle..."
npm run build --prefix "${ROOT_DIR}"

# Ensure the bundle exists before SEA prep
if [[ ! -f "${BUNDLE}" ]]; then
	echo "Bundle not found at ${BUNDLE}" >&2
	exit 1
fi

echo "Generating SEA blob..."
node --experimental-sea-config "${ROOT_DIR}/sea-config.json"

echo "Copying Node binary..."
cp "${NODE_BIN}" "${OUTPUT_BIN}"

# Remove old signature so injection succeeds
if command -v codesign >/dev/null 2>&1; then
	echo "Stripping existing code signature..."
	codesign --remove-signature "${OUTPUT_BIN}" 2>/dev/null || true
fi

echo "Injecting SEA blob..."
npx postject "${OUTPUT_BIN}" NODE_SEA_BLOB "${BLOB}" \
	--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
	--macho-segment-name NODE_SEA

chmod +x "${OUTPUT_BIN}"

# Ad-hoc sign so macOS will run the modified binary
if command -v codesign >/dev/null 2>&1; then
	echo "Ad-hoc signing SEA binary..."
	codesign --sign - --force --timestamp=none "${OUTPUT_BIN}"
fi

echo "SEA executable ready at ${OUTPUT_BIN}"
