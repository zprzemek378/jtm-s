# JTM-S — Jaka To Melodia (Spotify)

Lokalna gra w „Jaka To Melodia" dla 2–8 osób przy jednym komputerze. Muzyka leci
z wybranej playlisty Spotify, a każdy gracz ma przypisany własny klawisz.

React + TypeScript + React Router + Vite, style w SCSS (CSS Modules), dwa języki
(polski i angielski) oraz jasny/ciemny motyw.

## Wymagania

- **Konto Spotify Premium.** Odtwarzanie w przeglądarce realizuje Spotify Web
  Playback SDK, który bez Premium nie zagra.
- **Desktopowa przeglądarka** Chrome, Edge lub Firefox — SDK potrzebuje DRM
  (Widevine/EME). Przeglądarki mobilne nie są obsługiwane.
- Loguje się tylko jedna osoba — host, na którego maszynie leci muzyka. Gracze
  nie mają żadnych kont; mają klawisze.

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env    # i wpisz Client ID
npm run dev             # http://127.0.0.1:5173
```

Serwer dev celowo nasłuchuje na `127.0.0.1`, a nie na `localhost`: Spotify
odrzuca słowo `localhost` w Redirect URI i wymaga literalnego adresu pętli
lokalnej.

## Konfiguracja aplikacji Spotify

1. Utwórz aplikację w [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Włącz dla niej **Web API** oraz **Web Playback SDK**.
3. Dodaj Redirect URI, dokładnie w tej postaci:
   - `http://127.0.0.1:5173/` — dla dewelopmentu,
   - `https://<user>.github.io/jtm-s/` — jeśli wdrażasz na GitHub Pages.
4. W ustawieniach aplikacji (*User Management*) dopisz każde konto Spotify, które
   ma móc się zalogować. Aplikacja w trybie *development* wpuszcza **do 5 kont**
   (tak podaje dokumentacja *Quota modes*), a dopisanie konta to jednorazowa
   czynność właściciela aplikacji — po stronie grającego zostaje sam przycisk
   „Zaloguj". Właściciel aplikacji też musi mieć Premium, żeby aplikacja w tym
   trybie działała.
5. Skopiuj Client ID do `.env` jako `VITE_SPOTIFY_CLIENT_ID_1`. Wzór wszystkich
   zmiennych jest w `.env.example`.

Rozszerzenie limitu ponad 5 kont wymaga dziś zarejestrowanego podmiotu
gospodarczego i 250 000 aktywnych użytkowników miesięcznie, więc w praktyce nie
jest dostępne dla projektu prywatnego.

### Kilka aplikacji Spotify do wyboru

Skoro limit kont jest twardy, build może nieść **dowolnie wiele aplikacji
Spotify**, a host wybiera jedną w **Ustawieniach**. Każda ma własną listę wpuszczonych kont,
więc przełączenie to w praktyce przełączenie między grupami znajomych.

```
VITE_SPOTIFY_CLIENT_ID_1=…        VITE_SPOTIFY_CLIENT_NAME_1=Przemek
VITE_SPOTIFY_CLIENT_ID_2=…        VITE_SPOTIFY_CLIENT_NAME_2=Znajomi z Krakowa
```

Numeruj je od 1 w górę **bez przerw** — wyszukiwanie zatrzymuje się na pierwszym
numerze, którego w ogóle nie ma. Slot zostawiony pusty nadal się liczy i jest po
prostu pomijany, więc puste wartości są w porządku; brakująca linia nie.

Nazwa jest opcjonalna i służy tylko za etykietę na ekranie — bez niej pozycja
pokazuje się jako „Aplikacja 1". Wpis, który nie ma 32 znaków szesnastkowych,
jest pomijany. **Przełączenie aplikacji wylogowuje ze Spotify**, bo zapisane
tokeny należą do poprzedniej.

Niezależnie od tego każdy może w **Ustawieniach** wkleić własny Client ID
(zapisywany w `localStorage`) i użyć swojej aplikacji ze Spotify Dashboard — ma on
pierwszeństwo nad wbudowanymi. Wtedy trzeba tam dodać ten sam Redirect URI; ekran
ustawień podpowiada, jaki adres wpisać.

### O Client ID i sekretach

Aplikacja używa przepływu **Authorization Code z PKCE**, przewidzianego dla
klientów publicznych: **nie ma tu Client Secret** i nie jest potrzebny. Client ID
nie jest sekretem — leci w widocznym adresie URL przy każdym logowaniu, a Vite
wstawia go w treść zbudowanego bundla, więc na statycznym hostingu nie da się go
ukryć. Tym, co faktycznie chroni przepływ, jest jednorazowy code verifier i
allowlista Redirect URI w Spotify Dashboard.

Dlatego Client ID trzymamy poza repozytorium (`.env` jest w `.gitignore`), a w CI
wstrzykujemy go z sekretu — nie ma go w kodzie źródłowym, w historii gita ani w
logach Actions.

## Wersjonowanie

Wersja trzymana jest w `package.json`, pokazuje się małym drukiem na dole lewego
paska i jest podbijana na podstawie opisów commitów — zgodnie z **SemVer** i
**Conventional Commits**:

| typ commita | efekt | przykład |
|---|---|---|
| `feat!:` lub stopka `BREAKING CHANGE:` | MAJOR | `1.4.7` → `2.0.0` |
| `feat:` | MINOR | `1.4.7` → `1.5.0` |
| **wszystko inne** | PATCH | `1.4.7` → `1.4.8` |

Trzeci wiersz jest dosłowny: `fix:`, `chore:`, `docs:`, opis bez przedrostka —
każdy push na `main` dostaje nową wersję. Nie chodzi o schludną numerację, tylko
o to, żeby **każdy opublikowany stan dało się nazwać**. Numer w rogu aplikacji
zawsze identyfikuje dokładnie to, co działa, i do każdego z nich można wrócić
jednym uruchomieniem workflow z jego taga.

Gdyby część pushy publikowała się bez taga, numer na ekranie przestałby cokolwiek
znaczyć, a powrót cofałby za daleko — do ostatniego wydania, gubiąc po drodze
wszystko, co wyszło po nim.

**Dzieje się to samo, przy każdym pushu na `main`** — czy to ze scalenia pull
requesta, czy prosto z Twojego komputera. Workflow czyta commity od ostatniego
taga, podbija wersję, dopisuje `CHANGELOG.md`, tworzy commit `chore(release):`
i tag, wypycha to z powrotem, a dopiero potem buduje — więc numer w rogu
opublikowanej aplikacji zawsze zgadza się z tagiem.

Podbicie jest **jedno na push, nie jedno na commit**: narzędzie patrzy na
wszystko od ostatniego taga naraz i wybiera najwyższy znaleziony typ. Dwa
`feat:` i jeden `fix:` w jednym pushu to jedno podbicie MINOR, choć w changelogu
wylądują wszystkie trzy wpisy.

Wydanie powstaje **wyłącznie na `main`**. Uruchomienie workflow z taga — czyli
powrót do starszej wersji — publikuje tamten kod i nic poza tym.

Przy scalaniu pull requesta ze squashem pamiętaj, że GitHub podpowiada tytuł
PR-a, a nie commit konwencjonalny. To pole jest edytowalne w momencie scalania i
to właśnie ta wiadomość trafia do `main` i decyduje o wersji.

Można też wydać ręcznie, lokalnie:

```bash
npm run release -- --dry-run   # pokazuje co by się stało, nic nie zmienia
npm run release                # podbija, dopisuje changelog, taguje
git push --follow-tags
```

Taki push nie podbije wersji po raz drugi: tag wskazuje już na HEAD, więc
workflow nie znajduje nic nowego i przechodzi prosto do wdrożenia.

Wersję wstawia do bundla Vite, przez `define`, czytając ją z `package.json` —
więc numer na ekranie zawsze pochodzi z tego samego miejsca co tag.

### Gałęzie

Praca prosto na `main` jest w porządku przy drobiazgach, ale każdy push na `main`
**natychmiast publikuje się na Pages**, więc wszystko, co może ruszyć rozgrywkę,
lepiej prowadzić na gałęzi i scalać przez pull request ze **squashem**. Dwa
powody: CI zdąży przemielić lint i build, zanim cokolwiek pójdzie w świat, a
wiadomość squasha — jedyna, jaka trafia do `main` — jest tą, która decyduje o
podbiciu wersji. W trakcie pracy możesz commitować bałaganiarsko, porządek
wystarczy zrobić przy scalaniu.

Nie włączaj przy tym ostrej ochrony `main`, bo blokowałaby commit wydania.

## Wdrożenie na GitHub Pages

Workflow `.github/workflows/deploy.yml` buduje i publikuje aplikację przy pushu
na `main`. Przed pierwszym wdrożeniem dodaj w repozytorium sekret
`VITE_SPOTIFY_CLIENT_ID_1` (*Settings → Secrets and variables → Actions*, sekcja
**Repository secrets** — sekret dodany pod środowiskiem `github-pages` nie będzie
widoczny dla zadania budującego). Sekrety nazywają się dokładnie tak jak zmienne
w `.env`, więc kolejne aplikacje dodajesz jako `VITE_SPOTIFY_CLIENT_ID_2` i tak
dalej, bez ograniczenia liczby.

Workflow **nie wymienia ich po nazwie** — bo wtedy wróciłby limit. Przepisuje
każdy sekret, którego nazwa pasuje do wzorca `VITE_SPOTIFY_CLIENT_ID_<n>` albo
`VITE_SPOTIFY_CLIENT_NAME_<n>`, do pliku `.env` tuż przed budowaniem. Sekret
nazwany inaczej — łącznie z tokenem, którym to zadanie działa — jest pomijany, a
w logu pojawia się wyłącznie ich liczba, nigdy wartości.

Po nieudanym wdrożeniu uruchamiaj **Run workflow**, a nie *Re-run all jobs* —
ponowne uruchomienie tego samego przebiegu zostawia w nim dwa artefakty o nazwie
`github-pages` i `actions/deploy-pages` odmawia publikacji.

### Powrót do poprzedniej wersji

Każde wydanie ma tag, więc powrót nie wymaga ani komputera z kodem, ani gita —
wystarczy przeglądarka, choćby w telefonie:

1. **Actions → Deploy to GitHub Pages → Run workflow**
2. w „Use workflow from" wybierz **tag** zamiast gałęzi, na przykład `v1.0.1`
3. **Run workflow**

Zbuduje się i opublikuje kod z tego taga. Krok wydania sam się pominie: tag
wskazuje na HEAD, więc nie ma nic nowego do podbicia, a dodatkowo wydanie jest
zastrzeżone wyłącznie dla `main`.

**Wymaga to jednorazowego ustawienia.** Środowisko `github-pages` domyślnie
wpuszcza tylko gałąź domyślną i odrzuci taga komunikatem *„Tag … is not allowed
to deploy to github-pages due to environment protection rules"*. W *Settings →
Environments → github-pages → Deployment branches and tags* dodaj regułę: Ref
type **Tag**, wzorzec **`v*`**. Warto zrobić to zawczasu i raz sprawdzić, że
działa — ta furtka jest warta tyle, ile jej dostępność w momencie, gdy jest
potrzebna.

To rozwiązanie **doraźne**: `main` nadal zawiera wadliwy kod, więc najbliższy
push opublikuje go z powrotem. Na spokojnie użyj przycisku **Revert** przy
scalonym pull requeście i scal powstałego PR-a z tytułem zaczynającym się od
`fix:` — bez tego przedrostka wersja nie drgnie, bo GitHub podpowiada „Revert …".

`VITE_BASE` ustawia się automatycznie na `/<nazwa-repo>/`, a build kopiuje
`index.html` do `404.html`, bo GitHub Pages nie przepisuje ścieżek dla SPA.

**Aplikacji nie buduje się i nie wysyła ręcznie.** Build dzieje się wyłącznie w
GitHub Actions, przy pushu na `main`, a cały jego przebieg widać w logu zakładki
*Actions*. W repozytorium nie ma skompilowanych plików — `dist` jest w
`.gitignore`.

Żeby obejrzeć dokładnie to, co zostanie opublikowane, jeszcze przed pushem:

```bash
npm run build:pages     # ten sam build co w CI, z bazą /jtm-s/
npm run preview:pages   # serwuje dist pod http://127.0.0.1:4173/jtm-s/
```

Logowanie przez Spotify na podglądzie zadziała tylko, jeśli dopiszesz
`http://127.0.0.1:4173/jtm-s/` jako Redirect URI w Spotify Dashboard — do samego
sprawdzenia, czy build się poprawnie składa, nie jest to potrzebne.

## Jak ruch do Spotify jest dławiony

Spotify liczy żądania **na aplikację**, w ruchomym oknie trzydziestu sekund, więc
seria od jednej osoby kosztuje wszystkich korzystających z tego samego Client ID
— zmierzona blokada potrafiła trwać ponad dwadzieścia godzin. Dlatego wszystko,
co leci do Spotify, przechodzi przez **jedną kolejkę** w
`src/spotify/transport/queue.ts`, z jednym odstępem `REQUEST_GAP_MS` (80 ms).

Osobne kolejki nie wystarczą: choćby każda była ostrożna, mogą nadawać
równolegle. Jedna kolejka sprawia, że tempo jest faktem, a nie nadzieją.

Żądanie nie wybiera kolejki, tylko **deklaruje, czego potrzebuje**:

```ts
await request(getAccessToken, '/me/player/play?...', init, {
  priority: Priority.Playback,   // 0–10, kto idzie pierwszy
  coalesceKey: 'seek',           // nowsze zastępuje nierozpoczęte
  retryRateLimit: false,         // czy ponawiać po 429
})
```

| priorytet | wartość | co tam trafia |
|---|---|---|
| `Urgent` | 10 | pauza po zgłoszeniu, pobranie tokenu |
| `Playback` | 7 | start utworu, przewijanie, losowanie |
| `Catalogue` | 3 | playlisty, utwory, profil |
| `Background` | 0 | cokolwiek, na co nikt nie czeka |

**Czekanie podnosi priorytet** o jeden co `PRIORITY_AGING_MS` (500 ms), aż do
dziesiątki. Bez tego skan playlisty, który wysyła setki poleceń odtwarzania,
blokowałby odczyt katalogu na cały swój czas trwania.

**`coalesceKey` jest dla poleceń ustawiających wartość**, nie dla zdarzeń.
Przewijanie jest takim poleceniem: gdy przyjdzie kilka pozycji pod rząd, każda
poza ostatnią jest już nieaktualna, więc kolejka zachowuje tylko najnowszą, a
wszyscy wywołujący dostają ten sam wynik. Dla pauzy i wznowienia byłoby to
błędem — to dwa różne zdarzenia, a nie dwie wersje tej samej wartości.

### Dwie drogi do Spotify

Są dwie, i powyżej folderu `playback/` nie powinno mieć znaczenia, którą coś
leci:

- **`playback/viaRest.ts`** — zwykłe żądania Web API. Odtwarzacz potrafi
  sterować tylko tym, co już na nim jest, więc *umieszczenie* utworu na
  urządzeniu musi iść tą drogą.
- **`playback/viaSdk.ts`** — polecenia, które należą do odtwarzacza w
  przeglądarce: pauza, wznowienie, przewijanie, głośność.

SDK wysyła **własne żądania**, których nie widzimy ani nie liczymy. Kolejkujemy
to, jak często go prosimy; jego wewnętrznego ruchu nie kontrolujemy i nic po
naszej stronie tego nie zmieni.

## Tryb bezpieczny a cudze playlisty