#!/usr/bin/env bash
# Automatyczne podpisanie wtyczki w AMO przez API v5 (JWT) z użyciem web-ext.
#
# Dane dostępowe (wygeneruj na https://addons.mozilla.org/developers/addon/api/key/):
#   AMO_JWT_ISSUER  — "API key" (JWT issuer)
#   AMO_JWT_SECRET  — "API secret" (JWT secret)
#
# Skrypt czyta je ze zmiennych środowiskowych lub z pliku
# ~/.config/firefox-screenshot-plugin/amo.env (AMO_CREDS=... zmienia ścieżkę).
#
# Wynik: dist/fullpage-screenshot-<wersja>.xpi (podpisany, gotowy do dystrybucji)
set -euo pipefail
cd "$(dirname "$0")/.."

CREDS="${AMO_CREDS:-$HOME/.config/firefox-screenshot-plugin/amo.env}"
if [ -f "$CREDS" ]; then
  # shellcheck disable=SC1090
  set -a; . "$CREDS"; set +a
fi
: "${AMO_JWT_ISSUER:?Ustaw AMO_JWT_ISSUER (API key z AMO) — patrz tools/amo.env.example}"
: "${AMO_JWT_SECRET:?Ustaw AMO_JWT_SECRET (API secret z AMO) — patrz tools/amo.env.example}"

WEB_EXT="${WEB_EXT:-$HOME/.local/share/tools/web-ext/node_modules/.bin/web-ext}"
if [ ! -x "$WEB_EXT" ]; then
  echo "BŁĄD: nie znaleziono web-ext ($WEB_EXT)." >&2
  echo "Zainstaluj:  mkdir -p ~/.local/share/tools/web-ext && cd ~/.local/share/tools/web-ext && npm i web-ext" >&2
  exit 1
fi

VER="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"

# web-ext pakuje katalog źródłowy, więc przygotowujemy czysty "stage" z samymi
# plikami wtyczki (bez tools/, dist/, README, updates.json itd.).
STAGE="dist/stage"
rm -rf "$STAGE"
mkdir -p "$STAGE/icons"
cp manifest.json background.js options.html options.js options.css "$STAGE/"
cp icons/*.png "$STAGE/icons/"

rm -rf dist/web-ext-artifacts
echo "==> Podpisuję Pełny Zrzut Strony ${VER} w AMO (channel=unlisted)…"
"$WEB_EXT" sign \
  --source-dir "$STAGE" \
  --artifacts-dir dist/web-ext-artifacts \
  --channel unlisted \
  --api-key "$AMO_JWT_ISSUER" \
  --api-secret "$AMO_JWT_SECRET" \
  --no-input

SIGNED="$(ls -t dist/web-ext-artifacts/*.xpi 2>/dev/null | head -1 || true)"
if [ -z "$SIGNED" ]; then
  echo "BŁĄD: AMO nie zwróciło podpisanego pliku .xpi." >&2
  exit 1
fi

OUT="dist/fullpage-screenshot-${VER}.xpi"
cp "$SIGNED" "$OUT"
echo "==> Podpisany plik: $OUT"
