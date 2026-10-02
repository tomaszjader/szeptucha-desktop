import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Moon, Sun } from "lucide-react";
import "./styles.css";
import { translations } from "./translations";
import { Sidebar } from "./components/Sidebar";
import { Recorder } from "./components/Recorder";
import { History } from "./components/History";
import { SettingsForm } from "./components/SettingsForm";
import { Toast } from "./components/Toast";
import { playStartChime, playStopChime } from "./utils/audioChime";

const defaults: Settings = {
  provider: "local",
  apiKey: "",
  model: "whisper-tiny",
  whisperModel: "whisper-tiny",
  folder: "",
  format: "md",
  recordHotkey: "CommandOrControl+Shift+R",
  correctHotkey: "CommandOrControl+Q",
  launchAtStartup: false,
  language: "auto",
  saveFromInterface: true,
  saveFromShortcut: true,
  appLanguage: "system",
  soundEnabled: true,
};

function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("szeptucha-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [s, setS] = useState<Settings>(defaults);
  const [recordingState, setRecordingState] = useState<RecordingStatus>(() => window.szeptucha.getRecordingState());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [currentTab, setCurrentTab] = useState<"recording" | "history" | "settings">("recording");
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"info" | "success" | "error">("info");
  const [ready, setReady] = useState(false);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsSaveInFlight = useRef(false);

  const browserLanguage = navigator.language.toLowerCase();
  const systemLang = browserLanguage.startsWith("pl")
    ? "pl"
    : browserLanguage.startsWith("de")
      ? "de"
      : browserLanguage.startsWith("ru")
        ? "ru"
        : "en";
  const currentLang = !s.appLanguage || s.appLanguage === "system" ? systemLang : s.appLanguage;
  const t = translations[currentLang];

  const showToast = (message: string, type: "info" | "success" | "error" = "info", duration = 4500) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    setToastType(type);
    toastTimer.current = setTimeout(() => setToastMessage(""), duration);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("szeptucha-theme", theme);
    window.szeptucha.setTheme(theme);
  }, [theme]);

  const loadSettings = useCallback(async () => {
    setReady(false);
    setSettingsLoadFailed(false);
    try {
      const loaded = await window.szeptucha.getSettings();
      setS(loaded);
      setReady(true);
    } catch {
      setSettingsLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const soundEnabled = useRef(s.soundEnabled ?? true);
  useEffect(() => {
    soundEnabled.current = s.soundEnabled ?? true;
  }, [s.soundEnabled]);

  useEffect(() => {
    let previousPhase: RecordingStatus["phase"] = "idle";
    return window.szeptucha.onRecordingState((next) => {
      if (previousPhase !== next.phase && soundEnabled.current) {
        if (next.phase === "recording") playStartChime();
        if (previousPhase === "recording") playStopChime();
      }
      previousPhase = next.phase;
      setRecordingState(next);
    });
  }, []);

  const recording = recordingState.phase === "recording";
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return window.szeptucha.onStatus((x) => {
      const type = x.type === "error" ? "error" : x.type === "success" ? "success" : "info";
      showToast(x.message, type);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const saveSettings = async (next = s) => {
    if (settingsSaveInFlight.current) return;
    settingsSaveInFlight.current = true;
    setSettingsSaving(true);
    try {
      const saved = await window.szeptucha.saveSettings(next);
      setS(saved);
      showToast(t.settingsSaved, "success", 2500);
    } catch {
      showToast(t.settingsSaveFailed, "error");
    } finally {
      settingsSaveInFlight.current = false;
      setSettingsSaving(false);
    }
  };

  const chooseFolder = async () => {
    try {
      const folder = await window.szeptucha.chooseFolder();
      if (folder) await saveSettings({ ...s, folder });
    } catch {
      showToast(t.folderChooseFailed, "error");
    }
  };

  const toggleRecording = async () => {
    await window.szeptucha.toggleRecording();
  };

  if (!ready) {
    const loadingTranslations = translations[systemLang];
    return (
      <div className="loading">
        {settingsLoadFailed ? (
          <div className="loading-error" role="alert">
            <p>{loadingTranslations.settingsLoadFailed}</p>
            <button className="secondary" onClick={() => void loadSettings()}>
              {loadingTranslations.retry}
            </button>
          </div>
        ) : loadingTranslations.wakingUp}
      </div>
    );
  }

  return (
    <main>
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenOcr={() => window.szeptucha.openOcr()}
        lang={currentLang}
      />

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">{t.pulpit}</p>
            <h1>{t.hello}</h1>
            <p>{t.helloDesc}</p>
          </div>
          <div className="headerActions">
            <button
              className="themeToggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={theme === "light" ? t.themeDark : t.themeLight}
              title={theme === "light" ? t.themeDarkTitle : t.themeLightTitle}
            >
              {theme === "light" ? <Moon /> : <Sun />}
            </button>
            <span className={"status " + (s.provider === "local" || s.apiKey ? "ok" : "")}>
              <i />
              {s.provider === "local" || s.apiKey ? t.aiReady : t.aiRequired}
            </span>
          </div>
        </header>

        {currentTab === "recording" && (
          <Recorder
            recording={recording}
            recordingState={recordingState}
            elapsedMs={recording && recordingState.startedAt !== null
              ? Math.max(0, clockNow - recordingState.startedAt)
              : recordingState.durationMs}
            onToggleRecording={toggleRecording}
            s={s}
            lang={currentLang}
            onChangeFolder={chooseFolder}
            onOpenFolder={() => window.szeptucha.openFolder()}
            onCorrectText={() => window.szeptucha.correctSelection()}
          />
        )}

        {currentTab === "history" && (
          <History
            lang={currentLang}
            showToast={(msg) => showToast(msg, "success")}
            onOpenFolder={() => window.szeptucha.openFolder()}
          />
        )}

        {currentTab === "settings" && (
          <SettingsForm
            s={s}
            setS={setS}
            onSave={saveSettings}
            isSaving={settingsSaving}
            lang={currentLang}
          />
        )}
      </section>

      <Toast message={toastMessage} type={toastType} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
