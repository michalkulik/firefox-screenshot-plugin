#!/usr/bin/env bash
# Pakuje wtyczkę do dist/fullpage-screenshot.zip (gotowe do wysłania do AMO).
set -euo pipefail

cd "$(dirname "$0")/.."
out="dist/fullpage-screenshot.zip"
mkdir -p dist
rm -f "$out"

zip -r "$out" \
  manifest.json background.js options.html options.js options.css \
  icons README.md \
  -x '*.DS_Store'

echo "Utworzono $out"
