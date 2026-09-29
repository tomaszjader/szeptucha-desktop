/// <reference types="vite/client" />

interface NoteItem {
  id: string;
  filename: string;
  path: string;
  text: string;
  createdAt: string;
  format: 'txt' | 'md' | 'json';
  sizeBytes: number;
}

interface Window {
  szeptucha: {
    openOcr(): void;
    setTheme(theme: 'light' | 'dark'): void;
    getSettings(): Promise<Settings>;
    saveSettings(s: Settings): Promise<Settings>;
    chooseFolder(): Promise<string | null>;
    toggleRecording(): Promise<{ text: string; path: string } | undefined>;
    correctSelection(): Promise<{ ok: boolean; message: string }>;
    getRecordingState(): RecordingStatus;
    onRecordingState(cb: (state: RecordingStatus) => void): () => void;
    onStatus(cb: (s: { type: string; message: string }) => void): () => void;
    openFolder(): Promise<void>;
    getNotes(): Promise<NoteItem[]>;
    readNote(filePath: string): Promise<string>;
    deleteNote(filePath: string): Promise<boolean>;
  };
}

type RecordingStatus = {
  phase: 'idle' | 'starting' | 'recording' | 'transcribing' | 'loading-model' | 'completed' | 'error';
  source: 'interface' | 'shortcut' | 'tray';
  startedAt: number | null;
  durationMs: number;
  downloadProgress: number | null;
  error: string | null;
};

interface Settings {
  provider: 'openai' | 'gemini' | 'local';
  apiKey: string;
  model: string;
  whisperModel?: 'whisper-tiny' | 'whisper-base' | 'whisper-small';
  folder: string;
  format: 'txt' | 'md' | 'json';
  recordHotkey: string;
  correctHotkey: string;
  launchAtStartup: boolean;
  language: string;
  saveFromInterface: boolean;
  saveFromShortcut: boolean;
  appLanguage?: 'system' | 'pl' | 'en' | 'de' | 'ru';
  soundEnabled?: boolean;
}
