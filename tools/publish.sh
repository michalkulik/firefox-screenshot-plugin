#!/usr/bin/env bash
# Pełne wydanie nowej wersji: podpisanie w AMO (API) + release na GitHubie
# + aktualizacja updates.json.
#
# Wymaga danych API AMO (patrz tools/sign.sh) oraz zalogowanego `gh`.
#
# Użycie:
#   tools/publish.sh
#
# Wersję bierze z manifest.json — najpierw podnieś ją tam i zacommituj.
set -euo pipefail
cd "$(dirname "$0")/.."

VER="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
echo "==> Wydaję wersję ${VER}"

bash tools/sign.sh
bash tools/release.sh "$VER" "dist/fullpage-screenshot-${VER}.xpi"

echo
echo "==> Gotowe: wersja ${VER} podpisana i opublikowana."
