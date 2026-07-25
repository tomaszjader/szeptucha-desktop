import React, { useEffect, useRef, useState } from "react";
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
  const [recording, setRecording] = useState(false);
  const [currentTab, setCurrentTab] = useState<"recording" | "history" | "settings">("recording");
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"info" | "success" | "error">("info");
  const [ready, setReady] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const systemLang = navigator.language.startsWith("pl") ? "pl" : "en";
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

  useEffect(() => {
    window.szeptucha.getSettings().then((x) => {
      setS(x);
      setReady(true);
    });

    const cleanup = window.szeptucha.onRecordingToggle((active) => {
      setRecording(active);
      if (s.soundEnabled ?? true) {
        if (active) playStartChime();
        else playStopChime();
      }
    });

    return cleanup;
  }, [s.soundEnabled]);

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
    const saved = await window.szeptucha.saveSettings(next);
    setS(saved);
    showToast(t.settingsSaved, "success", 2500);
  };

  const chooseFolder = async () => {
    const folder = await window.szeptucha.chooseFolder();
    if (folder) saveSettings({ ...s, folder });
  };

  const toggleRecording = async () => {
    try {
      if (recording) {
        setRecording(false);
        if (s.soundEnabled ?? true) playStopChime();
        await window.szeptucha.stopRecording();
      } else {
        setRecording(true);
        if (s.soundEnabled ?? true) playStartChime();
        await window.szeptucha.startRecording();
      }
    } catch (e) {
      setRecording(false);
      showToast(e instanceof Error ? e.message : t.failedToRecord, "error");
    }
  };

  if (!ready) {
    const loadingText = systemLang === "pl" ? "Szeptucha budzi się…" : "Szeptucha is waking up…";
    return <div className="loading">{loadingText}</div>;
  }

  return (
    <main>
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
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
            lang={currentLang}
          />
        )}
      </section>

      <Toast message={toastMessage} type={toastType} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
