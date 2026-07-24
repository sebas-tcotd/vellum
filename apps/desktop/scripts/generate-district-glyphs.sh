#!/usr/bin/env bash
# Regenerates the DM Mono glyph PBFs consumed by MapLibre's `glyphs` style
# property (public/glyphs/DMMono-Regular/*.pbf) — needed to render text-field
# symbol layers (district name labels). Static output is committed to the
# repo; this script is only for regenerating it if the DM Mono version bumps.
#
# ponytail: manual regen script, not wired into `pnpm build` — glyphs change
# only when @fontsource/dm-mono is upgraded, not on every build. Requires
# `cargo install build_pbf_glyphs` and `pip install fonttools brotli` once.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/glyphs"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

WOFF2=$(find "$SCRIPT_DIR/../../.." -path "*/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2" -print -quit)
if [ -z "$WOFF2" ]; then
  echo "Could not find @fontsource/dm-mono — run 'pnpm install' first." >&2
  exit 1
fi

fonttools ttLib.woff2 decompress "$WOFF2" -o "$WORK_DIR/DMMono-Regular.ttf"
build_pbf_glyphs "$WORK_DIR" "$WORK_DIR/out" --overwrite

# Only keep non-empty ranges — the tool emits a 30-byte placeholder for every
# unused BMP range, and MapLibre tolerates missing/404 ranges at runtime.
rm -rf "$OUT_DIR/DMMono-Regular"
mkdir -p "$OUT_DIR/DMMono-Regular"
find "$WORK_DIR/out/DMMono-Regular" -type f -size +100c -exec cp {} "$OUT_DIR/DMMono-Regular/" \;

echo "Wrote $(find "$OUT_DIR/DMMono-Regular" -type f | wc -l | tr -d ' ') glyph range(s) to $OUT_DIR/DMMono-Regular"
