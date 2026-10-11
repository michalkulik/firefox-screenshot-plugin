#!/usr/bin/env bash
# Wydaje nową wersję wtyczki z auto-aktualizacją przez GitHub.
#
# Użycie:
#   tools/release.sh <wersja> <sciezka-do-podpisanego.xpi>
#
# Przykład:
#   tools/release.sh 1.0.3 ~/Pobrane/fullpage-screenshot-1.0.3-signed.xpi
#
# Co robi:
#   1. sprawdza, czy wersja w manifest.json zgadza się z podaną,
#   2. tworzy release na GitHubie (tag v<wersja>) i dołącza podpisany .xpi
#      pod nazwą fullpage-screenshot-<wersja>.xpi,
#   3. aktualizuje updates.json (update_link wskazuje na załącznik release'a),
#   4. commituje i wypycha updates.json.
#
# Podpisany .xpi zdobądź z AMO (Developer Hub → wersja self-distributed).
set -euo pipefail

REPO="michalkulik/firefox-screenshot-plugin"
BRANCH="main"

VER="${1:-}"
XPI="${2:-}"
if [ -z "$VER" ] || [ -z "$XPI" ]; then
  echo "Użycie: tools/release.sh <wersja> <sciezka-do-podpisanego.xpi>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

MANIFEST_VER="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
if [ "$MANIFEST_VER" != "$VER" ]; then
  echo "BŁĄD: wersja w manifest.json ($MANIFEST_VER) != podana ($VER)." >&2
  echo "Podnieś wersję w manifest.json i zacommituj, potem uruchom ponownie." >&2
  exit 1
fi

if [ ! -f "$XPI" ]; then
  echo "BŁĄD: nie znaleziono pliku XPI: $XPI" >&2
  exit 1
fi

ASSET="fullpage-screenshot-${VER}.xpi"
mkdir -p dist
if [ "$XPI" != "dist/$ASSET" ]; then
  cp "$XPI" "dist/$ASSET"
fi

echo "==> Tworzę release v${VER} na ${REPO}"
gh release create "v${VER}" "dist/$ASSET" \
  --repo "$REPO" \
  --title "v${VER}" \
  --notes "Wydanie ${VER} — zrzut całej strony jako jeden obraz." \
  --latest

UPDATE_LINK="https://github.com/${REPO}/releases/download/v${VER}/${ASSET}"

echo "==> Aktualizuję updates.json (${UPDATE_LINK})"
MINVER="$(python3 -c 'import json;print(json.load(open("manifest.json"))["browser_specific_settings"]["gecko"]["strict_min_version"])')"
python3 - "$VER" "$UPDATE_LINK" "$MINVER" <<'PY'
import json, sys
ver, link, minver = sys.argv[1], sys.argv[2], sys.argv[3]
p = "updates.json"
data = json.load(open(p))
addon = "fullpage-screenshot@mkulik.local"
updates = data.setdefault("addons", {}).setdefault(addon, {}).setdefault("updates", [])
updates = [u for u in updates if u.get("version") != ver]
updates.insert(0, {
    "version": ver,
    "update_link": link,
    "applications": {"gecko": {"strict_min_version": minver}},
})
data["addons"][addon]["updates"] = updates
json.dump(data, open(p, "w"), ensure_ascii=False, indent=2)
open(p, "a").write("\n")
print("updates.json →", ver, "(min", minver + ")")
PY

echo "==> Commituję i wypycham updates.json"
git add updates.json
git commit -m "updates.json: v${VER}"
git push origin "$BRANCH"

echo
echo "Gotowe. Firefox sprawdzi aktualizacje pod adresem:"
echo "  https://raw.githubusercontent.com/${REPO}/${BRANCH}/updates.json"
