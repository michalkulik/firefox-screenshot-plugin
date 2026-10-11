#!/usr/bin/env bash
# Pełne wydanie nowej wersji: podpisanie w AMO (API) + release na GitHubie
# + aktualizacja updates.json.
#
# Wymaga danych API AMO (patrz tools/sign.sh) oraz zalogowanego `gh`.
#
# Użycie:
#   tools/publish.sh
#
# Wersję bierze z manifest.json — najpierw podnieś ją tam (skrypt sam
# zacommituje i wypchnie podbicie wersji po udanym podpisaniu).
set -euo pipefail
cd "$(dirname "$0")/.."

VER="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
echo "==> Wydaję wersję ${VER}"

# 1. Najpierw podpisanie w AMO. Jeśli się nie uda — nic nie publikujemy.
bash tools/sign.sh

# 2. Dopiero teraz commitujemy podbicie wersji i wypychamy.
if ! git diff --quiet -- manifest.json; then
  git add manifest.json
  git commit -m "wersja ${VER}"
fi
git push origin main

# 3. Release na GitHubie z podpisanym plikiem + wpis w updates.json.
bash tools/release.sh "$VER" "dist/fullpage-screenshot-${VER}.xpi"

echo
echo "==> Gotowe: wersja ${VER} podpisana i opublikowana."
