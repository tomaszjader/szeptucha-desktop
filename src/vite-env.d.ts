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
    setTheme(theme: 'light' | 'dark'): void;
    getSettings(): Promise<Settings>;
    saveSettings(s: Settings): Promise<Settings>;
    chooseFolder(): Promise<string | null>;
    startRecording(): Promise<void>;
    stopRecording(): Promise<{ text: string; path: string }>;
    correctSelection(): Promise<{ ok: boolean; message: string }>;
    onRecordingToggle(cb: (active: boolean) => void): () => void;
    onStatus(cb: (s: { type: string; message: string }) => void): () => void;
    openFolder(): Promise<void>;
    getNotes(): Promise<NoteItem[]>;
    readNote(filePath: string): Promise<string>;
    deleteNote(filePath: string): Promise<boolean>;
  };
}

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
  appLanguage?: 'system' | 'pl' | 'en' | 'de';
  soundEnabled?: boolean;
}
