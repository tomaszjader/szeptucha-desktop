# Szeptucha Desktop

[English version (Englische Version)](README.md) | [Wersja polska (Polnische Version)](README.pl.md)

Szeptucha ist eine Desktop-Anwendung für Windows, die Mikrofonaufnahmen in Notizen umwandelt und ausgewählten Text mithilfe von KI verbessert. Sie kann Audio lokal und ohne API-Schlüssel transkribieren oder OpenAI beziehungsweise Google Gemini verwenden. Die Anwendung läuft im Hintergrund, bietet globale Tastenkürzel und speichert jede Transkription auf der Festplatte.

Aktuelle Version: **0.1.0**.

## Funktionen

- Audioaufnahme über die Benutzeroberfläche, das Infobereich-Symbol oder ein globales Tastenkürzel,
- lokale Transkription mit Whisper Tiny (`onnx-community/whisper-tiny`),
- cloudbasierte Transkription mit OpenAI oder Google Gemini,
- automatischer Wechsel zu lokalem Whisper, wenn kein API-Schlüssel angegeben wurde,
- automatisches Speichern von Notizen als Markdown (`.md`), Klartext (`.txt`) oder JSON (`.json`),
- direktes Einfügen des transkribierten Textes in die aktive Anwendung, wenn die Aufnahme mit dem globalen Tastenkürzel gestartet wurde,
- Korrektur von ausgewähltem Text in beliebigen Anwendungen mit OpenAI oder Gemini,
- schwebende Anzeige für aktive Aufnahmen auf dem Bildschirm, auf dem sich der Mauszeiger befindet,
- helles und dunkles Design, das sich anfangs an den Systemeinstellungen orientiert,
- Hintergrundbetrieb über das Symbol im Infobereich,
- optionaler automatischer Start mit Windows.

## Verwendung

### Aufnahme und Transkription

1. Klicken Sie in der Anwendung auf das Mikrofonsymbol oder drücken Sie `Ctrl+Shift+R`.
2. Nehmen Sie Ihre Notiz auf. Während der Aufnahme erscheint am unteren Bildschirmrand eine schwebende Anzeige.
3. Klicken Sie erneut auf das Mikrofon oder drücken Sie das Tastenkürzel erneut, um die Aufnahme zu beenden.
4. Die Transkription wird im ausgewählten Ordner gespeichert.

Aufnahmen, die über das globale Tastenkürzel gestartet wurden, werden zusätzlich in die Anwendung eingefügt, die beim Start der Aufnahme aktiv war. Aufnahmen, die über die Schaltfläche in der Anwendung oder das Menü im Infobereich gestartet wurden, werden nur in einer Datei gespeichert.

Standard-Tastenkürzel für Aufnahmen: `Ctrl+Shift+R`.

### Korrektur von ausgewähltem Text

1. Wählen Sie OpenAI oder Gemini und speichern Sie den passenden API-Schlüssel.
2. Markieren Sie Text in einer beliebigen Anwendung.
3. Drücken Sie `Ctrl+Q` oder klicken Sie auf „Ausgewählten Text korrigieren“.

Szeptucha kopiert den ausgewählten Text, korrigiert Tippfehler, Rechtschreibung, Zeichensetzung und offensichtliche Grammatikfehler und fügt anschließend das Ergebnis ein. Diese Funktion ist nicht vollständig lokal verfügbar und erfordert einen API-Schlüssel.

Standard-Tastenkürzel für die Korrektur: `Ctrl+Q`.

### Hintergrundbetrieb

Beim Schließen des Hauptfensters wird die Anwendung ausgeblendet, anstatt beendet zu werden. Über das Menü des Symbols im Infobereich können Sie das Fenster öffnen, eine Aufnahme starten oder beenden und Szeptucha vollständig schließen. Ein Doppelklick auf das Symbol stellt das Fenster wieder her.

## Transkriptions-Engines

| Engine | Standardmodell | API-Schlüssel | Verarbeitung |
| --- | --- | --- | --- |
| Lokales Whisper | `onnx-community/whisper-tiny` | nein | auf dem Computer des Benutzers |
| OpenAI | `gpt-4o-mini-transcribe` | ja | über die OpenAI API |
| Google Gemini | `gemini-2.0-flash` | ja | über die Google API |

Das lokale Modell wird bei der ersten Verwendung heruntergeladen, weshalb die erste Transkription länger dauern kann. Wenn für OpenAI oder Gemini kein API-Schlüssel eingerichtet ist, wird die Aufnahme automatisch lokal verarbeitet.

Die Textkorrektur verwendet `gpt-4o-mini` für OpenAI oder das ausgewählte Gemini-Modell.

## Einstellungen

In der Anwendung können Sie Folgendes konfigurieren:

- Transkriptions-Engine: lokales Whisper, OpenAI oder Gemini,
- API-Schlüssel für Cloud-Dienste,
- Format der gespeicherten Notizen,
- Auslöser für automatisches Speichern: Benutzeroberfläche und Tastenkürzel (beide standardmäßig aktiviert),
- Zielordner,
- Tastenkürzel für Aufnahmen,
- Tastenkürzel für die Textkorrektur,
- automatischer Start mit Windows,
- helles oder dunkles Design.

Standardmäßig werden Dateien im Ordner `Szeptucha` im Dokumente-Verzeichnis des Benutzers gespeichert. Die Dateien erhalten den Namen `notatka-<Datum-und-Uhrzeit>.<Format>`.

Die Einstellungen werden in der Datei `settings.json` im Datenverzeichnis der Electron-Anwendung gespeichert. Das ausgewählte Design wird separat im lokalen Speicher der Benutzeroberfläche abgelegt.

## Voraussetzungen

- Windows,
- Zugriff auf ein Mikrofon,
- Node.js und npm – nur zum Ausführen des Projekts aus dem Quellcode,
- ein API-Schlüssel für OpenAI oder Google Gemini – nur für Cloud-Transkription und Textkorrektur.

## Installation und Entwicklung

Abhängigkeiten installieren:

```powershell
npm install
```

Anwendung im Entwicklungsmodus starten:

```powershell
npm run dev
```

Dadurch wird der Vite-Entwicklungsserver unter `http://localhost:5173` gestartet und die Electron-Anwendung geöffnet.

Die bereits erstellte Anwendung ohne Entwicklungsserver starten:

```powershell
npm start
```

## Erstellen der Anwendung

Vollständiger Build der Anwendung und des Windows-Installationsprogramms:

```powershell
npm run build
```

Dieses Skript führt TypeScript-Prüfungen aus, erstellt das Frontend im Ordner `dist` und erzeugt ein NSIS-Installationsprogramm im Ordner `release`. Die Installationsdatei heißt `Szeptucha-Setup-<Version>.exe`, ermöglicht die Auswahl des Installationsverzeichnisses und erstellt Verknüpfungen auf dem Desktop sowie im Startmenü.

Nur das Frontend erstellen:

```powershell
npm run build:web
```

## Projektstruktur

```text
.
|-- assets/             # Symbole für Anwendung und Installationsprogramm
|-- electron/
|   |-- main.cjs        # Fenster, Infobereich, Tastenkürzel, API, Zwischenablage und Dateispeicherung
|   `-- preload.cjs     # Aufnahme, lokales Whisper und sichere IPC-Schnittstelle
|-- src/
|   |-- main.tsx        # React-Oberfläche und Einstellungen
|   |-- styles.css      # Stile sowie helles und dunkles Design
|   `-- vite-env.d.ts   # Typen für die von preload bereitgestellte API
|-- index.html          # Vite-Einstiegspunkt
|-- package.json        # Skripte, Abhängigkeiten und electron-builder-Konfiguration
|-- tsconfig.json       # TypeScript-Konfiguration
`-- vite.config.ts      # Vite-Konfiguration
```

## Datenschutz

- API-Schlüssel und Einstellungen werden lokal auf Ihrem Computer gespeichert,
- lokales Whisper sendet keine Aufnahmen an externe APIs,
- bei der Verwendung von OpenAI oder Gemini werden die Aufnahme oder der Text zur Verarbeitung an den ausgewählten Anbieter gesendet,
- Transkriptionen werden lokal im konfigurierten Ordner gespeichert.

## Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert. Weitere Informationen finden Sie in der Datei [LICENSE](LICENSE).
