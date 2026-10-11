# Pełny Zrzut Strony (Firefox)

Wtyczka do Firefoksa na komputer, która robi **zrzut całej strony — również
długiej i przewijanej — i zapisuje go jako jeden obraz** (PNG lub JPEG).

Firefox ma wbudowane narzędzie do zrzutów (`prawy przycisk → Zrób zrzut
ekranu`), ale potrafi ono zapisać tylko widoczny fragment albo „całą stronę”
w wersji bardzo okrojonej i bez wygodnego sterowania. Ta wtyczka dodaje
jedno kliknięcie, które zawsze zapisuje całą stronę.

## Jak to działa

Firefox udostępnia rozszerzeniom funkcję `browser.tabs.captureTab()` z opcją
`rect` (od Firefoksa 82). Pozwala ona uchwycić **dowolny prostokąt dokumentu w
pikselach CSS — także poza widocznym obszarem ekranu**. Wtyczka:

1. odczytuje pełne wymiary dokumentu (szerokość i wysokość, wraz z zawartością
   poza ekranem),
2. opcjonalnie przewija stronę od góry do dołu, aby wywołać leniwe wczytywanie
   obrazów i sekcji,
3. **przewija stronę na samą górę na czas zrzutu** (wymuszając
   natychmiastowe przewijanie, bo strony często mają
   `html { scroll-behavior: smooth }`) — dzięki temu przyklejone elementy
   (`position: fixed` / `sticky`, np. menu boczne i pasek nawigacji) trafiają
   na początek dokumentu, a nie na wysokość bieżącego przewinięcia,
4. pobiera cały dokument jednym wywołaniem `captureTab(rect = cała strona)`,
5. jeśli strona jest zbyt duża na jeden zrzut, dzieli ją na kafelki, zrzuca
   każdy osobno i skleja je na canvasie,
6. zapisuje wynik do pobranych plików, w podfolderze `zrzuty-www`, i przywraca
   pierwotną pozycję przewinięcia.

## Instalacja (tymczasowa, do testów)

1. Otwórz w Firefoksie `about:debugging#/runtime/this-firefox`.
2. Kliknij **Załaduj tymczasowy dodatek…**.
3. Wskaż plik `manifest.json` z tego katalogu.
4. Ikona wtyczki pojawi się na pasku narzędzi (przypnij ją przez menu
   z ukrytymi dodatkami, jeśli jej nie widać).

> Dodatek załadowany tymczasowo znika po restarcie Firefoksa. To normalne przy
> testach; do stałej instalacji trzeba go podpisać (patrz niżej).

## Instalacja stała (podpisanie w AMO + auto-aktualizacje)

Wtyczka jest dystrybuowana samodzielnie („On your own" na AMO), a aktualizacje
pobiera z tego repozytorium GitHub przez `update_url` w manifeście:

```
https://raw.githubusercontent.com/michalkulik/firefox-screenshot-plugin/main/updates.json
```

Proces wydania nowej wersji:

1. Podnieś `version` w `manifest.json` i zacommituj.

2. Podpisz i opublikuj — **automatycznie przez API AMO** (zalecane):

   ```bash
   tools/publish.sh
   ```

   Skrypt podpisuje wersję w AMO przez API (JWT, `web-ext sign`) i od razu
   publikuje release na GitHubie oraz aktualizuje `updates.json`.

   Dane dostępowe wygeneruj raz na
   <https://addons.mozilla.org/developers/addon/api/key/> („API key" i
   „API secret") i zapisz w `~/.config/firefox-screenshot-plugin/amo.env`
   (wzór: `tools/amo.env.example`):

   ```bash
   AMO_JWT_ISSUER="user:12345678:123"
   AMO_JWT_SECRET="..."
   ```

   Samo podpisanie (bez publikacji na GitHubie) to `tools/sign.sh`; wynik:
   `dist/fullpage-screenshot-<wersja>.xpi`.

3. Wariant ręczny (gdy wolisz klikanie): zbuduj paczkę `tools/package.sh`,
   wyślij ZIP na <https://addons.mozilla.org/developers/> → **Submit a New
   Add-on**, wybierz **„On your own"**, pobierz podpisany `.xpi` i opublikuj:

   ```bash
   tools/release.sh 1.0.4 ~/Pobrane/fullpage-screenshot-1.0.4-signed.xpi
   ```

   Skrypt utworzy release `v1.0.3` na GitHubie z załączonym `.xpi`, wpisze go do
   `updates.json` i wypchnie zmiany.

Firefox sprawdza `updates.json` (domyślnie raz na dobę) i instaluje nowszą
wersję automatycznie. Repozytorium z `updates.json` musi być **publiczne**, aby
Firefox mógł je odczytać.

## Użycie

- Kliknij ikonę wtyczki na pasku narzędzi, **albo**
- kliknij prawym przyciskiem na stronie i wybierz **Zrzut całej strony**.

Podczas pracy na ikonie pojawia się `…`, po zakończeniu `✓` (zielony) lub `!`
(czerwony) przy błędzie. Zrzut zapisuje się od razu w pobranych plikach. Na
bardzo długich stronach może to zająć kilka sekund (przewijanie + zrzut).

## Ustawienia

Kliknij ikonę wtyczki prawym przyciskiem → **Zarządzaj dodatkiem** →
**Preferencje** (albo `about:addons` → wtyczka → Preferencje):

| Opcja | Opis |
| --- | --- |
| Format | PNG (bezstratny) lub JPEG (mniejszy). |
| Jakość JPEG | 50–100 (dotyczy tylko JPEG). |
| Rozdzielczość | Automatyczna (jak ekran), 1× lub 2×. |
| Przewiń stronę przed zrzutem | Wczytuje leniwe obrazy/sekce przed zrzutem. |
| Zapisz jako | Pokazuje systemowe okno wyboru miejsca zapisu. |
| Otwórz w nowej karcie | Dodatkowo pokazuje zrzut w karcie. |
| Powiadomienie | Powiadomienie systemowe po zakończeniu. |

## Ograniczenia

- **Bardzo długie strony** są automatycznie skalowane w dół, aby zmieściły się
  w jednym obrazie (limit ok. 16 384 px na bok i 40 mln pikseli). Powyżej tego
  szczegóły tekstu mogą być mniejsze.
- **Strony wewnętrzne Firefoksa** (`about:…`) oraz strona `addons.mozilla.org`
  nie pozwalają na wstrzykiwanie skryptów, więc zrzut tam nie zadziała.
- **Pliki lokalne** (`file://`) wymagają włączenia w `about:addons` opcji
  „Dostęp do adresów plików” dla wtyczki.
- Zawartość wewnątrz elementów z własnym przewijaniem (np. `div` z
  `overflow: scroll`) jest zrzucana tylko w aktualnie widocznym stanie — tak
  samo zachowuje się wbudowane narzędzie Firefoksa.
- Elementy `position: fixed` / `sticky` (przyklejone menu i paski) są pokazane
  **raz, u góry** dokumentu (tak jak w zrzucie „całej strony" Firefoksa).
  Wtyczka przewija stronę na górę na czas zrzutu, żeby trafiły na właściwe
  miejsce, a po zrzucie przywraca poprzednią pozycję.
- Wtyczka wymaga zgody na dostęp do danych wszystkich stron
  (`<all_urls>`), bo tylko wtedy Firefox pozwala użyć `captureTab`.

## Struktura projektu

```
manifest.json          definicja dodatku (Manifest V3, Firefox event page)
background.js          cała logika: pomiar, przewijanie, zrzut, sklejanie, zapis
options.html/js/css    panel ustawień
icons/                 ikony (generowane skryptem)
updates.json           manifest aktualizacji dla Firefoxa (update_url)
tools/make_icons.py    generator ikon (Pillow)
tools/package.sh       pakowanie do dist/*.zip
tools/sign.sh          podpisanie w AMO przez API (web-ext, JWT)
tools/release.sh       wydanie wersji: GitHub release + updates.json
tools/publish.sh       pełne wydanie: podpisanie + release + updates.json
tools/amo.env.example  wzór danych dostępowych do API AMO
```

## Prywatność

Wtyczka **nie zbiera i nie przesyła żadnych danych** — nie ma telemetrii,
analytics ani połączeń z serwerami. Zrzuty zapisywane są wyłącznie lokalnie w
pobranych plikach. W manifeście zadeklarowano to zgodnie z wymogiem Mozilli:

```json
"data_collection_permissions": { "required": ["none"] }
```

## Licencja

MIT.
