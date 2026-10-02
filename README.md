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

Skoro limit kont jest twardy, build może nieść **do pięciu aplikacji Spotify**, a
host wybiera jedną w **Ustawieniach**. Każda ma własną listę wpuszczonych kont,
więc przełączenie to w praktyce przełączenie między grupami znajomych.

```
VITE_SPOTIFY_CLIENT_ID_1=…        VITE_SPOTIFY_CLIENT_NAME_1=Przemek
VITE_SPOTIFY_CLIENT_ID_2=…        VITE_SPOTIFY_CLIENT_NAME_2=Znajomi z Krakowa
```

Nazwa jest opcjonalna i służy tylko za etykietę na ekranie — bez niej pozycja
pokazuje się jako „Aplikacja 1". Puste slota są pomijane, podobnie jak wpis, który
nie ma 32 znaków szesnastkowych. **Przełączenie aplikacji wylogowuje ze Spotify**,
bo zapisane tokeny należą do poprzedniej.

Liczba pięciu jest sztywna, bo Vite podstawia te nazwy do kodu podczas budowania,
a to działa tylko dla nazw wypisanych w całości — pętla po
`VITE_SPOTIFY_CLIENT_ID_${n}` odczytałaby się jako `undefined`.

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

## Wdrożenie na GitHub Pages

Workflow `.github/workflows/deploy.yml` buduje i publikuje aplikację przy pushu
na `main`. Przed pierwszym wdrożeniem dodaj w repozytorium sekret
`SPOTIFY_CLIENT_ID_1` (*Settings → Secrets and variables → Actions*). Jeśli chcesz
mieć do wyboru więcej aplikacji, dodaj kolejne — `SPOTIFY_CLIENT_ID_2` i tak dalej
wraz z `SPOTIFY_CLIENT_NAME_2` — do pięciu. Nieustawiony sekret przychodzi jako
pusty ciąg i jest po prostu pomijany, więc nieużywane slota nic nie kosztują.

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

## Tryb bezpieczny a cudze playlisty

W **Ustawieniach** jest przełącznik **trybu bezpiecznego**, domyślnie włączony.

- **Włączony** — gra korzysta wyłącznie z tego, co Spotify API udostępnia
  wprost: playlist Twoich i współtworzonych. Cudze są na liście nieaktywne.
- **Wyłączony** — cudze playlisty można dodać, **skanując je przez
  odtwarzanie**. Aplikacja startuje playlistę jako kontekst na wyciszonym
  odtwarzaczu z `repeat=context`, odczytuje z `GET /me/player/queue` bieżący
  utwór i 20 następnych, po czym przeskakuje o 21 pozycji przez
  `offset: {position}` — i tak aż kolejka zawinie się na początek. Wynik trafia
  do puli dokładnie jak zwykła playlista i jest zapisywany, więc kolejny raz
  jest darmowy.

Skanowanie ma wbudowane ograniczenia, których nie należy luzować bez powodu:
**3 sekundy odstępu na skok**, **maksymalnie 8 skoków** (około 170 utworów) i
**natychmiastowe przerwanie przy pierwszym `429`**, bez ponawiania. Powód jest
konkretny: limit Spotify liczony jest dla całej aplikacji w oknie 30 sekund, a
przekroczenie go w trybie development zwróciło na tym projekcie `Retry-After`
równe **81731 sekund, czyli 22,7 godziny** całkowitej blokady Client ID. Dlatego
skanuj krótkie playlisty, po 50–100 utworów.

Skrypt, którym tę metodę badaliśmy — wraz z opisem, co dokładnie dowodzi i
jakich pułapek unikać (autoplay dopychający kolejkę utworami spoza playlisty) —
leży w `scripts/playlist-scan-probe.js`. Jego pełna walidacja jest jeszcze przed
nami.

## Tempo zapytań do Spotify

Limit Spotify liczony jest **dla całej aplikacji w oknie 30 sekund**, a jego
przekroczenie w trybie development potrafi odciąć Client ID na wiele godzin.
Wczytywanie playlist to jedyna rzecz, którą ta aplikacja robi masowo: kilka
wybranych playlist, każda stronicowana po 50 utworów, to łatwo ponad sto
zapytań — a przywracanie poprzedniego wyboru odpala je równolegle.

Dlatego **odczyty katalogu są kolejkowane w kliencie API**: jedno naraz, nie
częściej niż co 80 ms. Kolejkowanie siedzi w kliencie, a nie w miejscach
wywołań, żeby żaden układ wywołań nie mógł przypadkiem wystrzelić serią.
Sterowanie odtwarzaniem **omija kolejkę** — tych zapytań jest mało, a runda nie
może czekać za wczytywaniem playlisty. Do tego każde zapytanie po `429`
odczekuje i ponawia, honorując nagłówek `Retry-After`.

## Dźwięki

Gra ma własne krótkie sygnały — osobne od muzyki, która idzie ze Spotify.
Dodawanie i zmienianie ich to dwa kroki:

1. Wrzuć pliki `.mp3` do `src/assets/sounds/`. Nazwij je jak chcesz — nic poza
   konfiguracją ich nie zna. Zapchajdziury dostarczone z projektem mają
   przedrostek `c-`, żeby łatwo było odróżnić je od własnych plików.
2. Przypisz je do momentów w grze w `src/constants/soundChoices.ts`.

**Na jeden moment może przypadać wiele dźwięków, losowanych według szans** —
łącznie z szansą na ciszę, co zwykle najlepiej chroni sygnał przed opatrzeniem
się przez cały wieczór:

```ts
[SoundEvent.RoundStart]: [
  { chance: 0.3, file: 'done_1.mp3' },
  { chance: 0.4, file: 'start_dj.mp3' },
  { chance: 0.3, file: SILENCE },
],
```

Szanse są **względne**, więc nie muszą sumować się dokładnie do 1 — wartości
0,3 / 0,4 / 0,3 zachowują się tak samo jak 3 / 4 / 3. Jeśli sumują się do
jedynki, można je czytać jak procenty.

Momenty, którym można przypisać dźwięk: start rundy, każde tyknięcie odliczania
3 – 2 – 1, zgłoszenie gracza, remis, poprawna odpowiedź, błędna odpowiedź
(również ta „bez kary" — pieniądze przepadają tak samo), koniec czasu i koniec
gry.

Nazwa pliku, której nie ma w folderze, oznacza po prostu ciszę — nic się nie
psuje, ale też nic nie zagra, więc warto uważać na literówki.

W **Ustawieniach** jest jeden przełącznik: czy dźwięki gry mają się odtwarzać.
Domyślnie są włączone.

Pliki audio nigdy nie są wbudowywane w bundel, nawet gdy są małe: dzięki temu
każdy ma w nazwie skrót treści i po podmianie nikomu nie zostanie stara wersja
w pamięci podręcznej.

## Test klawiatury

W **Ustawieniach** jest panel rejestrujący kolejno wciskane klawisze wraz z
odstępami między nimi. Powstał pod konkretne pytanie, które ta gra stawia
sprzętowi: czy jedna klawiatura zarejestruje kilka osób naciskających różne
klawisze w tej samej chwili.

Czas brany jest ze znacznika `KeyboardEvent.timeStamp`, czyli z momentu, w
którym przeglądarka utworzyła zdarzenie — a nie z momentu obsługi, bo ten
zawierałby jeszcze opóźnienie głównego wątku. Panel pokazuje też zmierzoną
**rozdzielczość zegara tej strony**, odczytywaną przez odpytywanie go w pętli aż
do zmiany wartości; nie da się jej uzyskać inaczej.

Wyżej niż to podskoczyć się nie da i warto o tym wiedzieć: przeglądarki celowo
zaokrąglają zegar wysokiej rozdzielczości (zwykle do 0,1 ms, a bez izolacji
cross-origin nawet do 1 ms), a zwykła klawiatura USB raportuje stan co ~8 ms.
Odstępy poniżej mikrosekundy wypisywane są w µs. Gdy dwa naciśnięcia trafią w
ten sam krok zaokrąglonego zegara, ich znaczniki czasu są **identyczne**, więc
odstęp wynosi dosłownie zero — takie wiersze opisane są jako „poniżej 0,1 ms",
a nie jako zmierzone zero, i panel liczy, ile razy to się zdarzyło. To
najbliższa odpowiedź, jaką przeglądarka daje na pytanie „czy klawiatura
zarejestrowała te naciśnięcia jako jednoczesne". Auto-powtarzanie przy
przytrzymaniu klawisza jest pomijane.

## Remisy

Pod panelem testu klawiatury jest przełącznik **Remisy** wraz z polem na próg w
milisekundach (domyślnie `0.2`, czyli 0,200 ms). Próg jest **włączający** —
odstęp równy dokładnie progowi liczy się jako remis. Porównanie odbywa się z
**dokładnością do mikrosekundy, czyli dokładnie taką, jaką pokazuje ekran**:
odstęp wypisany jako `0.200 ms` liczy się jako 0,200 ms, więc reguła nigdy nie
przeczy temu, co widzisz. Gdy dwie osoby lub więcej
nacisną swoje klawisze w odstępie nie większym niż próg:

- **nikt nie odpowiada** i nikt nic nie traci,
- **utwór gra dalej**, a na ekranie pojawia się „Remis!" z nazwiskami,
- **następna tura jest dogrywką wyłącznie między nimi** — pozostali pauzują,
  a plansza pisze dlaczego, tak samo jak przy karze za błędną odpowiedź.

**Remis idzie łańcuchem: odstęp liczy się do poprzedniej osoby, nie do
pierwszej.** Jeśli Ala nacisnęła jako pierwsza, Bob 0,2 ms po niej, a Cel 0,2 ms
po Bobie, to przy progu 0,2 ms remisuje **cała trójka** — mimo że Alę i Cela
dzieli 0,4 ms. Każde naciśnięcie przesuwa punkt odniesienia. Łańcuch urywa się
na pierwszym zbyt dużym odstępie i nikt po nim już się nie łapie, bo jest
jeszcze później. Ekran zgłoszenia wypisuje to imiennie:
`Ala — pierwszy, Bob +0.200 ms, Cel +0.200 ms`.

Tak samo zachowuje się okno zbierania naciśnięć: **każde kolejne je przedłuża**,
żeby łańcuch nie został ucięty przez mechanizm zamiast przez wybrany próg.
Górny limit 1,5 s zapobiega trzymaniu tury w nieskończoność przez kogoś, kto
opiera się o klawisz.

Jak to działa mimo że próg jest ułamkiem milisekundy: **nic nie jest odmierzane
zegarem**. Naciśnięcia są zbierane przez 12 ms — tyle, ile potrzeba, by dotarło
drugie naprawdę jednoczesne naciśnięcie przy odpytywaniu klawiatury co 8 ms — a
potem porównywane po **własnych znacznikach czasu zdarzeń**, bo tylko one są
dostatecznie dokładne. Opóźnia to zatrzymanie muzyki o 12 ms, czego nie da się
usłyszeć. Próg bierz z panelu testu klawiatury: on pokazuje, jakie odstępy Twój
sprzęt i przeglądarka faktycznie rozróżniają.

## Zasady gry

### Ustawienia domyślne

Przy pierwszym wejściu aplikacja jest gotowa do gry bez zmieniania czegokolwiek:
tryb stawki **naprzemienny**, cel **$1000**, runda **15 s**, czas na odpowiedź
**25 s**, **remisy włączone** z progiem **0,2 ms**, **tryb bezpieczny włączony**
i język **polski**. Motyw idzie za ustawieniem systemu, dopóki ktoś nie wybierze
go ręcznie w nawigacji.

### Przed grą

1. **Gracze i klawisze** — od 2 do 8 osób, każda wybiera swój klawisz. Bez tego
   nie da się przejść dalej.
2. **Tryb stawki** — pięć wariantów, opisanych niżej.
3. **Cel** — kwota, po której gra się kończy. Domyślnie **$1000**, krok $100.
4. **Czas trwania rundy** — ile sekund gra fragment, zanim runda przepadnie.
   Domyślnie **15 s**. Na tym czasie rozkłada się też zmiana stawki.
5. **Czas na odpowiedź** — umowny zegar dla gracza, który się zgłosił.
   Domyślnie **25 s**; po jego upływie nic się nie dzieje.
6. **Playlisty** — jedna lub kilka, patrz wyżej.

### Tryby stawki

Drabinka stawek ma zawsze jedenaście szczebli: **100, 110, 120, … 200**.

| Tryb | Zachowanie |
| --- | --- |
| **Stała** | Każda piosenka warta $100. |
| **Rosnąca** | Stawka rośnie od $100 do $200 — im dłużej nikt nie wie, tym więcej do wzięcia. |
| **Malejąca** | Stawka spada od $200 do $100 — kto pierwszy, ten bierze więcej. |
| **Naprzemienna** | Rundy rosnące i malejące na zmianę; następna jest zapowiadana z góry. |
| **Losowa** | Rosnąca albo malejąca losowo, bez zapowiedzi — poznacie ją, gdy zacznie grać muzyka. |

Zmiana stawki jest **proporcjonalna do długości rundy**: czas rundy dzieli się
na jedenaście równych części, więc każdy szczebel jest aktywny dokładnie tyle
samo. Przy 11 sekundach stawka przeskakuje co sekundę, a przy domyślnych
15 sekundach co niecałe 1,4 s.

### Przebieg rundy

**Każdą rundę poprzedza odliczanie 3 – 2 – 1** — także pierwszą w grze i
pierwszą po „Zagraj ponownie", żeby nikogo nie zaskoczyła pierwsza piosenka
wieczoru. Przy wyczerpanej puli utworów odliczanie nie rusza: ekran czeka na
hosta zamiast zapętlać się w nieskończoność.

1. Losowy utwór startuje od losowego momentu — nigdy w pierwszych 20 ani w
   ostatnich 30 sekundach — i rusza zegar rundy. Na ekranie widać **aktualną
   stawkę**, która zmienia się zgodnie z trybem.
2. **Nikt się nie zgłosił:** po upływie czasu pokazuje się tytuł i przycisk
   „Następna tura", a utwór gra dalej. Nikt nic nie dostaje.
3. **Ktoś się zgłosił:** muzyka i zegar stają, a **stawka zamraża się na tej
   kwocie, którą gracz widział w momencie wciśnięcia klawisza**. Rusza umowny
   zegar na odpowiedź. Po „Odkryj odpowiedź" muzyka wznawia się z miejsca pauzy
   i pojawia się ocena.
   - **Poprawnie** — zamrożona kwota wpływa na konto gracza.
   - **Niepoprawnie** — kwota przepada, a gracz pauzuje przez najbliższą turę:
     jego kafelek jest przyciemniony, a jego klawisz nie reaguje.
   - **Niepoprawnie, ale bez kary** — kwota przepada, ale pauzy nie ma. Dla
     odpowiedzi bliskiej prawdy, np. gdy ktoś pomyli jedno słowo w tytule.
     Przycisk jest celowo mniejszy, odsunięty pod linią i **bez skrótu
     klawiszowego** — używa się go rzadko, a omyłkowe wciśnięcie po cichu
     anulowałoby czyjąś karę.
4. Po ocenie widać werdykt, kwotę i tytuł, utwór nadal gra, a dalej prowadzi
   „Następna tura" z odliczaniem **3 – 2 – 1**.
5. Gra kończy się, gdy ktoś uzbiera docelową kwotę. Można zagrać ponownie z tymi
   samymi ustawieniami albo wrócić do ich zmiany.

**Skróty klawiszowe hosta.** „Odkryj odpowiedź", „Następna tura" i „Spróbuj
ponownie" reagują na **Enter lub spację**. Przy ocenie odpowiedzi **Enter lub
spacja to „poprawnie", a Backspace to „niepoprawnie"**. Te klawisze, razem z
Tab i Esc, są zarezerwowane i nie da się ich przypisać graczowi jako buzzera.

Utwory nie powtarzają się **w całej serii gier**, nie tylko w jednej. Losujemy
bez zwracania, a lista już zagranych przeżywa zarówno „Zagraj ponownie", jak i
powrót do ustawień — wystarczy, że wybór playlist zostanie ten sam. Historia
jest przypisana do zestawu playlist (niezależnie od kolejności wybierania), więc
zmiana playlist zaczyna liczenie od nowa. Gdy cała pula zostanie wyczerpana,
cykl startuje od początku zamiast się zaciąć.

### Tryb edycji (ukryty)

Na ekranie z przyciskiem „Następna tura" — czyli po wyczerpaniu czasu albo po
ocenie odpowiedzi — wpisanie z klawiatury **`AEZAKMI`** (wielkość liter bez
znaczenia) otwiera okno ręcznej korekty: stan konta każdego gracza i pauza w
następnej turze. Nic tego nie zapowiada na ekranie.

Nasłuch działa **wyłącznie** w tych dwóch momentach, gdy gra czeka na hosta —
i to jest zarazem powód, dla którego litery kodu nie muszą być wyłączone z puli
klawiszy do wyboru przez graczy: ich buzzery są wtedy i tak nieaktywne. Kod nie
przechwytuje ani nie blokuje żadnego klawisza, więc niczego nie psuje, gdyby
ktoś wpisał go przypadkiem.

Ustawienie komuś kwoty równej celowi lub wyższej **kończy grę** — zasada „cel
kończy grę" obowiązuje niezależnie od tego, skąd wzięły się pieniądze. Okno
ostrzega o tym przy takiej wartości.

## Struktura

```
src/
  components/
    ui/          przyciski, inputy, panele — komponenty globalne
    advanced/    modal, dialog potwierdzenia
    layout/      nawigacja, przełącznik języka i motywu
    game/        ekrany i widżety samej rozgrywki
  constants/     dane na sztywno: zasady gry, kolory graczy, stałe Spotify
  game/          typy, reduktor stanu rundy, hooki rozgrywki
  helpers/       czyste funkcje (losowanie fragmentu, pula utworów, klawisze…)
  hooks/         hooki ogólnego przeznaczenia (odliczanie, nasłuch klawiszy)
  i18n/          tłumaczenia i kontekst języka
  pages/         widoki tras
  routes/        definicja tras
  spotify/       PKCE, klient Web API, Web Playback SDK, provider
  storage/       dostęp do localStorage, który nigdy nie rzuca
  styles/        zmienne SCSS (_core.scss) i style globalne
  theme/         jasny/ciemny motyw
```

## Skrypty

| Komenda | Działanie |
| --- | --- |
| `npm run dev` | serwer deweloperski na `http://127.0.0.1:5173` |
| `npm run build` | sprawdzenie typów (`tsc -b`) i build produkcyjny |
| `npm run lint` | oxlint |
| `npm run preview` | podgląd zbudowanej aplikacji |
