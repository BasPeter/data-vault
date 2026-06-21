#!/usr/bin/env bash
# Regenerate build/icon.png from build/icon.master.svg.
#
# The master SVG keeps the artwork body within the 824/1024 Apple icon safe
# area, so the packaged app icon renders at the same visual size as native
# macOS apps (a full-bleed icon looks oversized in the Dock). Rendering uses
# macOS QuickLook, which preserves the transparent margin.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/build/icon.master.svg"
out="$root/build/icon.png"

if ! command -v qlmanage >/dev/null 2>&1; then
  echo "build-icon: qlmanage is required (macOS only)." >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

qlmanage -t -s 1024 -o "$tmp" "$src" >/dev/null 2>&1
rendered="$tmp/$(basename "$src").png"

if [ ! -f "$rendered" ]; then
  echo "build-icon: QuickLook failed to render $src." >&2
  exit 1
fi

cp "$rendered" "$out"
echo "build-icon: wrote $out ($(sips -g pixelWidth -g pixelHeight "$out" | tail -2 | tr -s ' \n' ' '))"
