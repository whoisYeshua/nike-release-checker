#!/usr/bin/env bash
# Regenerate the macOS (.icns) + Windows (.ico) app icons from a single source
# image. Drop in your own artwork (square, ideally 1024x1024) and run this, then
# rebuild the app — the build scripts pick up build/macos/icon.icns and
# build/windows/icon.ico automatically.
#
# Usage:
#   build/make-icons.sh [path/to/source.(svg|png|jpg)]
# Default source: build/assets/icon.svg
#
# Requires macOS tools: sips, iconutil, python3, and (for SVG input) qlmanage.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/build/assets/icon.svg}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ ! -f "$SRC" ]]; then echo "Source not found: $SRC" >&2; exit 1; fi

# 1. Get a 1024x1024 PNG master. SVG → rasterize via QuickLook; else sips coerces.
case "$SRC" in
  *.svg|*.SVG)
    qlmanage -t -s 1024 -o "$WORK" "$SRC" >/dev/null 2>&1 || true
    RAW="$WORK/$(basename "$SRC").png"
    [[ -f "$RAW" ]] || { echo "SVG rasterize failed (qlmanage). Provide a PNG instead." >&2; exit 1; } ;;
  *) RAW="$SRC" ;;
esac
MASTER="$WORK/master_1024.png"
sips -s format png -z 1024 1024 "$RAW" --out "$MASTER" >/dev/null

# 2. macOS .icns
ICONSET="$WORK/icon.iconset"; mkdir -p "$ICONSET"
gen(){ sips -z "$1" "$1" "$MASTER" --out "$ICONSET/$2" >/dev/null; }
gen 16 icon_16x16.png;    gen 32 icon_16x16@2x.png
gen 32 icon_32x32.png;    gen 64 icon_32x32@2x.png
gen 128 icon_128x128.png; gen 256 icon_128x128@2x.png
gen 256 icon_256x256.png; gen 512 icon_256x256@2x.png
gen 512 icon_512x512.png; gen 1024 icon_512x512@2x.png
mkdir -p "$ROOT/build/macos" "$ROOT/build/windows"
iconutil -c icns "$ICONSET" -o "$ROOT/build/macos/icon.icns"

# 3. Windows .ico (PNG-embedded; Windows Vista+). No ImageMagick needed.
for s in 16 32 48 64 128 256; do sips -z "$s" "$s" "$MASTER" --out "$WORK/ico_$s.png" >/dev/null; done
python3 - "$WORK" "$ROOT/build/windows/icon.ico" <<'PY'
import struct, sys
work, out = sys.argv[1], sys.argv[2]
sizes=[16,32,48,64,128,256]
pngs=[open(f'{work}/ico_{s}.png','rb').read() for s in sizes]
buf=bytearray(); buf+=struct.pack('<HHH',0,1,len(sizes)); off=6+16*len(sizes)
for s,d in zip(sizes,pngs):
    wh=0 if s>=256 else s
    buf+=struct.pack('<BBBBHHII', wh,wh,0,0,1,32,len(d),off); off+=len(d)
for d in pngs: buf+=d
open(out,'wb').write(buf)
PY

cp "$MASTER" "$ROOT/build/assets/icon-1024.png"
echo "Icons regenerated from: $SRC"
echo "  -> build/macos/icon.icns"
echo "  -> build/windows/icon.ico"
echo "Now rebuild: bash build/build-bot-app-macos.sh --arch arm64  (and the Windows .ps1)"
