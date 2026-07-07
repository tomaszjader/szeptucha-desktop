# Szeptucha Desktop

Szeptucha to aplikacja desktopowa dla Windows do szybkiego tworzenia notatek glosowych i poprawiania zaznaczonego tekstu z pomoca AI. Dziala jako aplikacja Electron z interfejsem React/Vite, ma ikone w zasobniku systemowym, globalne skroty klawiaturowe i zapisuje transkrypcje lokalnie na dysku.

## Najwazniejsze funkcje

- nagrywanie notatek glosowych z mikrofonu,
- transkrypcja lokalna przez Whisper Tiny z `@huggingface/transformers`,
- opcjonalna transkrypcja przez OpenAI albo Google Gemini,
- automatyczny zapis notatek w formatach `.md`, `.txt` albo `.json`,
- globalny skrot do nagrywania: domyslnie `Ctrl+Shift+R`,
- globalny skrot do korekty tekstu: domyslnie `Ctrl+Q`,
- poprawianie zaznaczonego tekstu w dowolnej aplikacji,
- wklejanie wyniku transkrypcji po zakonczeniu nagrywania uruchomionego skrotem,
- konfiguracja folderu zapisu, dostawcy AI, klucza API i uruchamiania wraz z systemem,
- dzialanie w tle przez tray systemowy.

## Stos technologiczny

- Electron - warstwa desktopowa, tray, globalne skroty, schowek i komunikacja z systemem,
- React - interfejs aplikacji,
- Vite - bundling i serwer developerski,
- TypeScript - typowanie kodu frontendu,
- `@huggingface/transformers` - lokalna transkrypcja Whisper,
- Electron Builder - budowanie instalatora Windows.

## Wymagania

- Node.js,
- npm,
- Windows,
- dostep do mikrofonu,
- opcjonalnie klucz API OpenAI albo Google Gemini, jezeli chcesz korzystac z chmurowej transkrypcji lub korekty tekstu.

## Instalacja

```powershell
npm install
```

## Tryb developerski

```powershell
npm run dev
```

Ten skrypt uruchamia jednoczesnie serwer Vite oraz aplikacje Electron. Electron czeka, az frontend bedzie dostepny pod `http://localhost:5173`.

## Budowanie aplikacji

```powershell
npm run build
```

Polecenie wykonuje:

1. kompilacje TypeScript,
2. build frontendu Vite do folderu `dist`,
3. przygotowanie instalatora Windows przez Electron Builder.

Gotowe artefakty trafiaja do folderu `release`. Nazwa instalatora ma format:

```text
Szeptucha-Setup-<wersja>.exe
```

Mozesz tez zbudowac sam frontend:

```powershell
npm run build:web
```

## Uruchomienie gotowej aplikacji z repozytorium

```powershell
npm start
```

## Konfiguracja w aplikacji

W panelu ustawien mozna wybrac:

- silnik transkrypcji: lokalny Whisper, OpenAI albo Gemini,
- format zapisu notatek,
- folder docelowy dla transkrypcji,
- klucz API,
- skrot nagrywania,
- skrot korekty,
- uruchamianie aplikacji wraz z systemem Windows.

Ustawienia sa zapisywane lokalnie w katalogu danych aplikacji Electron jako `settings.json`.

## Dostawcy transkrypcji i AI

### Lokalnie

Tryb lokalny nie wymaga klucza API. Aplikacja uzywa modelu `onnx-community/whisper-tiny` przez `@huggingface/transformers`.

### OpenAI

Domyslny model transkrypcji to `gpt-4o-mini-transcribe`, a korekta tekstu korzysta z modelu `gpt-4o-mini`.

### Google Gemini

Domyslny model to `gemini-2.0-flash`.

## Struktura projektu

```text
.
|-- assets/             # ikony aplikacji
|-- electron/
|   |-- main.cjs        # proces glowny Electron: okno, tray, skroty, API, zapis plikow
|   `-- preload.cjs     # bezpieczny most IPC dla frontendu i obsluga nagrywania
|-- src/
|   |-- main.tsx        # aplikacja React
|   |-- styles.css      # style interfejsu
|   `-- vite-env.d.ts   # typy API wystawianego przez preload
|-- index.html          # punkt wejscia Vite
|-- package.json        # skrypty, zaleznosci i konfiguracja electron-builder
|-- tsconfig.json       # konfiguracja TypeScript
`-- vite.config.ts      # konfiguracja Vite
```

## Jak dziala aplikacja

Frontend React odpowiada za ekran nagrywania i ustawienia. Kod w `preload.cjs` udostepnia do frontendu obiekt `window.szeptucha`, ktory pozwala nagrywac audio, zatrzymywac nagranie, zapisywac ustawienia i odbierac statusy. Proces glowny Electron w `main.cjs` obsluguje zapis plikow, tray, globalne skroty, komunikacje z API OpenAI/Gemini, schowek oraz wysylanie skrotow klawiaturowych do systemu.

Po nagraniu dzwiek jest transkrybowany lokalnie albo wysylany do wybranego dostawcy AI. Wynik trafia do wybranego folderu jako notatka. Jezeli nagrywanie zostalo uruchomione globalnym skrotem, aplikacja moze dodatkowo wkleic transkrypcje do aktywnego miejsca pracy.

## Prywatnosc

- Klucz API jest przechowywany lokalnie na komputerze uzytkownika.
- Tryb lokalny nie wymaga wysylania nagrania do zewnetrznego API.
- W trybie OpenAI albo Gemini nagranie lub tekst jest wysylany do wybranego dostawcy w celu transkrypcji albo korekty.

## Przydatne skrypty

```powershell
npm run dev       # aplikacja w trybie developerskim
npm run build     # pelny build aplikacji desktopowej
npm run build:web # build samego frontendu
npm start         # uruchomienie Electron
```

## Licencja

Projekt jest oznaczony jako prywatny w `package.json`.
