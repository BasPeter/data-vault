#!/usr/bin/env bash
# Regenerate build/icon.png from build/icon.master.svg.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
"$root/node_modules/.bin/electron" "$root/scripts/render-icon.mjs"
