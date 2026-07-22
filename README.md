# Szeptucha Desktop

[Wersja polska (Polish version)](README.pl.md)

Szeptucha is a desktop application for Windows that converts microphone recordings into notes and refines selected text using AI. It can transcribe audio locally without an API key, or use OpenAI or Google Gemini. It runs in the background, provides global keyboard shortcuts, and saves every transcription to disk.

Current version: **0.1.0**.

## Features

- audio recording from the app interface, system tray, or via global shortcut,
- local transcription via Whisper Tiny (`onnx-community/whisper-tiny`),
- cloud-based transcription via OpenAI or Google Gemini,
- automatic fallback to local Whisper when no API key is provided,
- automatic saving of notes as Markdown (`.md`), plain text (`.txt`), or JSON (`.json`),
- pasting the transcribed text directly into the active application if the recording was started with the global shortcut,
- correcting selected text in any application using OpenAI or Gemini,
- a floating indicator for active recording, displayed on the monitor containing the cursor,
- light and dark themes matching the system settings initially,
- background operation via the system tray icon,
- optional startup with Windows.

## How to Use

### Recording and Transcription

1. Click the microphone icon in the application or press the `Ctrl+Shift+R` shortcut.
2. Record your note. A floating indicator will appear at the bottom of the screen during recording.
3. Click the microphone again or press the shortcut key to stop recording.
4. The transcription will be saved in the selected folder.

Recordings started via the global shortcut will also be pasted into the application that was active when you started the recording. Recordings started via the app button or system tray menu are only saved to a file.

Default recording shortcut: `Ctrl+Shift+R`.

### Correcting Selected Text

1. Select OpenAI or Gemini and save the correct API key.
2. Highlight text in any application.
3. Press `Ctrl+Q` or click "Correct selected text".

Szeptucha copies the selected text, corrects typos, spelling, punctuation, and obvious grammatical errors, and then pastes the result. This feature is not available fully locally and requires an API key.

Default correction shortcut: `Ctrl+Q`.

### Background Operation

Closing the main window hides the application instead of quitting it. From the system tray icon menu, you can open the window, start or stop recording, and exit Szeptucha completely. Double-clicking the icon restores the window.

## Transcription Engines

| Engine | Default Model | API Key | Processing |
| --- | --- | --- | --- |
| Local Whisper | `onnx-community/whisper-tiny` | no | on user's machine |
| OpenAI | `gpt-4o-mini-transcribe` | yes | in OpenAI API |
| Google Gemini | `gemini-2.0-flash` | yes | in Google API |

The local model is downloaded on first use, so the first transcription may take longer. If no API key is configured for OpenAI or Gemini, the recording will automatically be processed locally.

Text correction uses `gpt-4o-mini` for OpenAI or the selected Gemini model.

## Settings

In the application, you can configure:

- transcription engine: local Whisper, OpenAI, or Gemini,
- API key for cloud services,
- format of saved notes,
- autosave triggers: GUI and shortcut (both enabled by default),
- destination folder,
- recording shortcut,
- text correction shortcut,
- launch on Windows startup,
- light or dark theme.

The default save location is the `Szeptucha` folder in the user's Documents directory. Files are named `notatka-<date-and-time>.<format>`.

Settings are stored in the `settings.json` file in the Electron application data directory. The chosen theme is stored separately in the UI local storage.

## Requirements

- Windows,
- microphone access,
- Node.js and npm — only for running the project from source,
- OpenAI or Google Gemini API key — only for cloud transcription and text correction.

## Installation and Development

Install dependencies:

```powershell
npm install
```

Run the application in development mode:

```powershell
npm run dev
```

This starts the Vite development server at `http://localhost:5173` and launches the Electron application.

Run the pre-built application without the development server:

```powershell
npm start
```

## Building

Full build of the application and Windows installer:

```powershell
npm run build
```

This script performs TypeScript checks, builds the frontend to `dist`, and creates an NSIS installer in the `release` folder. The installer is named `Szeptucha-Setup-<version>.exe` and allows choosing the installation directory; it also creates desktop and Start Menu shortcuts.

Build frontend only:

```powershell
npm run build:web
```

## Project Structure

```text
.
|-- assets/             # application and installer icons
|-- electron/
|   |-- main.cjs        # windows, tray, shortcuts, API, clipboard, and file saving
|   `-- preload.cjs     # recording, local Whisper, and secure IPC bridge
|-- src/
|   |-- main.tsx        # React interface and settings
|   |-- styles.css      # styles and light/dark theme
|   `-- vite-env.d.ts   # types for API exposed by preload
|-- index.html          # Vite entry point
|-- package.json        # scripts, dependencies, and electron-builder configuration
|-- tsconfig.json       # TypeScript configuration
`-- vite.config.ts      # Vite configuration
```

## Privacy

- API key and settings are stored locally on your computer,
- local Whisper does not send recordings to external APIs,
- when using OpenAI or Gemini, the recording or text is sent to the chosen provider for processing,
- transcriptions are saved locally in the configured folder.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
