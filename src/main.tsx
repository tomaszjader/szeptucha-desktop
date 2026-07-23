import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Mic,
  Settings as SettingsIcon,
  FolderOpen,
  Sparkles,
  Keyboard,
  ShieldCheck,
  StopCircle,
  Check,
  AudioLines,
  Eye,
  EyeOff,
  Moon,
  Sun,
} from "lucide-react";
import "./styles.css";
import { translations } from "./translations";

const defaults: Settings = {
  provider: "local",
  apiKey: "",
  model: "whisper-tiny",
  folder: "",
  format: "md",
  recordHotkey: "CommandOrControl+Shift+R",
  correctHotkey: "CommandOrControl+Q",
  launchAtStartup: false,
  language: "auto",
  saveFromInterface: true,
  saveFromShortcut: true,
  appLanguage: "system",
};
function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("szeptucha-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [s, setS] = useState<Settings>(defaults),
    [recording, setRecording] = useState(false),
    [showKey, setShowKey] = useState(false),
    [toast, setToast] = useState(""),
    [ready, setReady] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const systemLang = navigator.language.startsWith("pl") ? "pl" : "en";
  const currentLang = !s.appLanguage || s.appLanguage === "system" ? systemLang : s.appLanguage;
  const t = translations[currentLang];
  const showToast = (message: string, duration = 4500) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), duration);
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
    return window.szeptucha.onRecordingToggle(setRecording);
  }, []);
  useEffect(
    () =>
      window.szeptucha.onStatus((x) => {
        showToast(x.message);
      }),
    [],
  );
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const save = async (next = s) => {
    const saved = await window.szeptucha.saveSettings(next);
    setS(saved);
    showToast(t.settingsSaved, 2500);
  };
  const choose = async () => {
    const folder = await window.szeptucha.chooseFolder();
    if (folder) save({ ...s, folder });
  };
  const toggle = async () => {
    try {
      if (recording) {
        setRecording(false);
        await window.szeptucha.stopRecording(new ArrayBuffer(0), "");
      } else {
        setRecording(true);
        await window.szeptucha.startRecording();
      }
    } catch (e) {
      setRecording(false);
      showToast(e instanceof Error ? e.message : t.failedToRecord);
    }
  };
  if (!ready) {
    const loadingText = systemLang === "pl" ? "Szeptucha budzi się…" : "Szeptucha is waking up…";
    return <div className="loading">{loadingText}</div>;
  }
  return (
    <main>
      <aside>
        <div className="brand">
          <div className="logo">
            <AudioLines />
          </div>
          <div>
            <b>Szeptucha</b>
            <small>{t.brandSubtitle}</small>
          </div>
        </div>
        <nav>
          <button className="active">
            <Mic />
            {t.navRecording}
          </button>
          <button
            onClick={() =>
              document.getElementById("settings")?.scrollIntoView()
            }
          >
            <SettingsIcon />
            {t.navSettings}
          </button>
        </nav>
        <div className="privacy">
          <ShieldCheck />
          <div>
            <b>{t.privacyTitle}</b>
            <small>
              {t.privacyText}
            </small>
          </div>
        </div>
        <span className="version">Szeptucha 0.1.0</span>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">{t.pulpit}</p>
            <h1>{t.hello}</h1>
            <p>{t.helloDesc}</p>
          </div>
          <div className="headerActions">
            <button className="themeToggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? t.themeDark : t.themeLight} title={theme === "light" ? t.themeDarkTitle : t.themeLightTitle}>
              {theme === "light" ? <Moon /> : <Sun />}
            </button>
            <span className={"status " + (s.provider === "local" || s.apiKey ? "ok" : "")}>
              <i />
              {s.provider === "local" || s.apiKey ? t.aiReady : t.aiRequired}
            </span>
          </div>
        </header>
        <div className={"recorder " + (recording ? "recording" : "")}>
          <div className="orb">
            <div className="rings" />
            <button onClick={toggle}>
              {recording ? <StopCircle /> : <Mic />}
            </button>
          </div>
          <h2>{recording ? t.recordingActive : t.readyToListen}</h2>
          <p>
            {recording
              ? t.recordingActiveDesc
              : t.readyToListenDesc}
          </p>
          <kbd>{s.recordHotkey.replace("CommandOrControl", "Ctrl")}</kbd>
        </div>
        <div className="grid">
          <article>
            <div className="cardhead">
              <span className="icon purple">
                <Sparkles />
              </span>
              <div>
                <h3>{t.textCorrection}</h3>
                <p>{t.textCorrectionDesc}</p>
              </div>
            </div>
            <div className="shortcut">
              <Keyboard />
              <span>{t.globalShortcut}</span>
              <kbd>{s.correctHotkey.replace("CommandOrControl", "Ctrl")}</kbd>
            </div>
            <button
              className="secondary"
              onClick={() => window.szeptucha.correctSelection()}
            >
              {t.correctSelectedText}
            </button>
          </article>
          <article>
            <div className="cardhead">
              <span className="icon amber">
                <FolderOpen />
              </span>
              <div>
                <h3>{t.saveLocation}</h3>
                <p>{t.saveLocationDesc}</p>
              </div>
            </div>
            <div className="folder">
              <span>{s.folder || t.noFolderSelected}</span>
              <button onClick={choose}>{t.changeBtn}</button>
            </div>
            <button
              className="secondary"
              onClick={() => window.szeptucha.openFolder()}
            >
              {t.openFolderBtn}
            </button>
          </article>
        </div>
        <section id="settings" className="settings">
          <div>
            <p className="eyebrow">{t.configuration}</p>
            <h2>{t.settingsTitle}</h2>
          </div>
          <div className="formgrid">
            <label>
              {t.transcriptionEngine}
              <select
                value={s.provider}
                onChange={(e) =>
                  setS({
                    ...s,
                    provider: e.target.value as Settings["provider"],
                    model:
                      e.target.value === "openai"
                        ? "gpt-4o-mini-transcribe"
                        : e.target.value === "gemini"
                          ? "gemini-2.0-flash"
                          : "whisper-tiny",
                  })
                }
              >
                <option value="local">{t.localWhisper}</option>
                <option value="openai">{t.openai}</option>
                <option value="gemini">{t.gemini}</option>
              </select>
            </label>
            <label>
              {t.noteFormat}
              <select
                value={s.format}
                onChange={(e) =>
                  setS({ ...s, format: e.target.value as Settings["format"] })
                }
              >
                <option value="md">Markdown (.md)</option>
                <option value="txt">Tekst (.txt)</option>
                <option value="json">JSON (.json)</option>
              </select>
            </label>
            <label className="wide">
              {t.apiKey}
              <div className="key">
                <input
                  type={showKey ? "text" : "password"}
                  value={s.apiKey}
                  placeholder={t.pasteApiKey}
                  onChange={(e) => setS({ ...s, apiKey: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? t.hideApiKey : t.showApiKey}
                  title={showKey ? t.hideApiKey : t.showApiKey}
                >
                  {showKey ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            <label>
              {t.recordingShortcut}
              <input
                value={s.recordHotkey}
                onChange={(e) => setS({ ...s, recordHotkey: e.target.value })}
              />
            </label>
            <label>
              {t.correctionShortcut}
              <input
                value={s.correctHotkey}
                onChange={(e) => setS({ ...s, correctHotkey: e.target.value })}
              />
            </label>
            <label>
              {t.interfaceLanguage}
              <select
                value={s.appLanguage || "system"}
                onChange={(e) =>
                  setS({ ...s, appLanguage: e.target.value as Settings["appLanguage"] })
                }
              >
                <option value="system">{t.systemLanguage}</option>
                <option value="pl">{t.langPl}</option>
                <option value="en">{t.langEn}</option>
              </select>
            </label>
            <label>
              {t.recordingLanguage}
              <select
                value={s.language || "auto"}
                onChange={(e) =>
                  setS({ ...s, language: e.target.value })
                }
              >
                <option value="auto">{t.langAuto}</option>
                <option value="pl">{t.langPl}</option>
                <option value="en">{t.langEn}</option>
              </select>
            </label>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={s.launchAtStartup}
              onChange={(e) =>
                setS({ ...s, launchAtStartup: e.target.checked })
              }
            />
            <span />
            {t.launchAtStartup}
          </label>
          <fieldset className="saveOptions">
            <legend>{t.autoNoteSave}</legend>
            <p>{t.autoNoteSaveDesc}</p>
            <label>
              <input
                type="checkbox"
                checked={s.saveFromInterface}
                onChange={(e) =>
                  setS({ ...s, saveFromInterface: e.target.checked })
                }
              />
              {t.fromGui}
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.saveFromShortcut}
                onChange={(e) =>
                  setS({ ...s, saveFromShortcut: e.target.checked })
                }
              />
              {t.fromShortcut}
            </label>
          </fieldset>
          <button className="primary" onClick={() => save()}>
            <Check />
            {t.saveSettingsBtn}
          </button>
        </section>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
