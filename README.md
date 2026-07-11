# Szeptucha Desktop

Szeptucha to aplikacja desktopowa dla Windows, która zamienia nagrania z mikrofonu w notatki i poprawia zaznaczony tekst z pomocą AI. Może transkrybować dźwięk lokalnie, bez klucza API, albo korzystać z OpenAI lub Google Gemini. Działa w tle, udostępnia globalne skróty klawiaturowe i zapisuje każdą transkrypcję na dysku.

Aktualna wersja: **0.1.0**.

## Funkcje

- nagrywanie dźwięku z poziomu aplikacji, zasobnika systemowego lub globalnego skrótu,
- lokalna transkrypcja przez Whisper Tiny (`onnx-community/whisper-tiny`),
- transkrypcja w chmurze przez OpenAI lub Google Gemini,
- automatyczny fallback do lokalnego Whispera, gdy nie podano klucza API,
- automatyczny zapis notatek jako Markdown (`.md`), zwykły tekst (`.txt`) lub JSON (`.json`),
- wklejanie gotowej transkrypcji do aktywnej aplikacji, jeśli nagrywanie rozpoczęto globalnym skrótem,
- korekta zaznaczonego tekstu w dowolnej aplikacji przez OpenAI lub Gemini,
- pływający wskaźnik aktywnego nagrywania, wyświetlany na monitorze z kursorem,
- jasny i ciemny motyw, dobierany początkowo do ustawień systemu,
- praca w tle przez ikonę w zasobniku systemowym,
- opcjonalne uruchamianie razem z systemem Windows.

## Jak korzystać

### Nagrywanie i transkrypcja

1. Kliknij mikrofon w aplikacji albo użyj skrótu `Ctrl+Shift+R`.
2. Nagraj notatkę. Podczas nagrywania u dołu ekranu pojawi się pływający wskaźnik.
3. Kliknij ponownie mikrofon albo ponownie użyj skrótu, aby zakończyć nagrywanie.
4. Transkrypcja zostanie zapisana w wybranym folderze.

Nagranie rozpoczęte globalnym skrótem jest po transkrypcji dodatkowo wklejane w miejsce, które było aktywne podczas pracy. Nagranie uruchomione przyciskiem w aplikacji lub z menu zasobnika jest tylko zapisywane do pliku.

Domyślny skrót nagrywania: `Ctrl+Shift+R`.

### Korekta zaznaczonego tekstu

1. Wybierz OpenAI albo Gemini i zapisz właściwy klucz API.
2. Zaznacz tekst w dowolnej aplikacji.
3. Naciśnij `Ctrl+Q` albo kliknij „Popraw zaznaczony tekst”.

Szeptucha kopiuje zaznaczenie, poprawia literówki, ortografię, interpunkcję i oczywiste błędy gramatyczne, a następnie wkleja wynik. Ta funkcja nie jest dostępna w pełni lokalnie i wymaga klucza API.

Domyślny skrót korekty: `Ctrl+Q`.

### Praca w tle

Zamknięcie głównego okna ukrywa aplikację zamiast ją wyłączać. Z menu ikony w zasobniku można otworzyć okno, rozpocząć lub zakończyć nagrywanie oraz całkowicie zamknąć Szeptuchę. Dwukrotne kliknięcie ikony ponownie otwiera okno.

## Silniki transkrypcji

| Silnik | Model domyślny | Klucz API | Przetwarzanie |
| --- | --- | --- | --- |
| Lokalny Whisper | `onnx-community/whisper-tiny` | nie | na komputerze użytkownika |
| OpenAI | `gpt-4o-mini-transcribe` | tak | w API OpenAI |
| Google Gemini | `gemini-2.0-flash` | tak | w API Google |

Model lokalny jest pobierany przy pierwszym użyciu, dlatego pierwsza transkrypcja może potrwać dłużej. Jeśli dla OpenAI lub Gemini nie zapisano klucza API, nagranie zostanie automatycznie przetworzone lokalnie.

Korekta tekstu korzysta z `gpt-4o-mini` dla OpenAI albo z wybranego modelu Gemini.

## Ustawienia

W aplikacji można skonfigurować:

- silnik transkrypcji: lokalny Whisper, OpenAI albo Gemini,
- klucz API dla usług chmurowych,
- format zapisywanych notatek,
- folder docelowy,
- skrót nagrywania,
- skrót korekty tekstu,
- uruchamianie wraz z systemem Windows,
- jasny lub ciemny motyw.

Domyślnym miejscem zapisu jest folder `Szeptucha` w katalogu Dokumenty użytkownika. Pliki otrzymują nazwę `notatka-<data-i-czas>.<format>`.

Ustawienia są przechowywane w pliku `settings.json` w katalogu danych aplikacji Electron. Wybrany motyw jest zapisywany osobno w lokalnej pamięci interfejsu.

## Wymagania

- Windows,
- dostęp do mikrofonu,
- Node.js i npm — tylko do uruchamiania projektu ze źródeł,
- klucz API OpenAI albo Google Gemini — tylko do transkrypcji chmurowej i korekty tekstu.

## Instalacja i rozwój

Zainstaluj zależności:

```powershell
npm install
```

Uruchom aplikację w trybie developerskim:

```powershell
npm run dev
```

Polecenie uruchamia serwer Vite pod adresem `http://localhost:5173` i aplikację Electron.

Uruchom wcześniej zbudowaną aplikację bez serwera developerskiego:

```powershell
npm start
```

## Budowanie

Pełny build aplikacji i instalatora Windows:

```powershell
npm run build
```

Skrypt wykonuje kontrolę TypeScript, buduje frontend do `dist` i tworzy instalator NSIS w folderze `release`. Plik instalatora ma nazwę `Szeptucha-Setup-<wersja>.exe` i pozwala wybrać katalog instalacji; tworzy też skróty na pulpicie i w menu Start.

Build samego frontendu:

```powershell
npm run build:web
```

## Struktura projektu

```text
.
|-- assets/             # ikony aplikacji i instalatora
|-- electron/
|   |-- main.cjs        # okna, tray, skróty, API, schowek i zapis plików
|   `-- preload.cjs     # nagrywanie, lokalny Whisper i bezpieczny most IPC
|-- src/
|   |-- main.tsx        # interfejs React i ustawienia
|   |-- styles.css      # style oraz jasny i ciemny motyw
|   `-- vite-env.d.ts   # typy API udostępnianego przez preload
|-- index.html          # punkt wejścia Vite
|-- package.json        # skrypty, zależności i konfiguracja electron-builder
|-- tsconfig.json       # konfiguracja TypeScript
`-- vite.config.ts      # konfiguracja Vite
```

## Prywatność

- klucz API i ustawienia są przechowywane lokalnie na komputerze,
- lokalny Whisper nie wysyła nagrania do zewnętrznego API,
- przy korzystaniu z OpenAI lub Gemini nagranie albo tekst trafia do wybranego dostawcy w celu przetworzenia,
- transkrypcje są zapisywane lokalnie w skonfigurowanym folderze.

## Licencja

Projekt jest prywatny (`"private": true` w `package.json`) i nie zawiera obecnie osobnego pliku licencji.
