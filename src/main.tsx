import React, { useEffect, useState } from "react";
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

const defaults: Settings = {
  provider: "local",
  apiKey: "",
  model: "whisper-tiny",
  folder: "",
  format: "md",
  recordHotkey: "CommandOrControl+Shift+R",
  correctHotkey: "CommandOrControl+Q",
  launchAtStartup: false,
  language: "pl",
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
        setToast(x.message);
        setTimeout(() => setToast(""), 4500);
      }),
    [],
  );
  const save = async (next = s) => {
    const saved = await window.szeptucha.saveSettings(next);
    setS(saved);
    setToast("Ustawienia zapisane");
    setTimeout(() => setToast(""), 2500);
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
      setToast(e instanceof Error ? e.message : "Nie udało się nagrywać");
      setTimeout(() => setToast(""), 4500);
    }
  };
  if (!ready) return <div className="loading">Szeptucha budzi się…</div>;
  return (
    <main>
      <aside>
        <div className="brand">
          <div className="logo">
            <AudioLines />
          </div>
          <div>
            <b>Szeptucha</b>
            <small>Głos zamieniony w słowa</small>
          </div>
        </div>
        <nav>
          <button className="active">
            <Mic />
            Nagrywanie
          </button>
          <button
            onClick={() =>
              document.getElementById("settings")?.scrollIntoView()
            }
          >
            <SettingsIcon />
            Ustawienia
          </button>
        </nav>
        <div className="privacy">
          <ShieldCheck />
          <div>
            <b>Twój klucz, Twoje dane</b>
            <small>
              Klucz API jest przechowywany lokalnie na tym komputerze.
            </small>
          </div>
        </div>
        <span className="version">Szeptucha 0.1.0</span>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">PULPIT</p>
            <h1>Dzień dobry 👋</h1>
            <p>Nagraj myśl. Szeptucha zajmie się resztą.</p>
          </div>
          <div className="headerActions">
            <button className="themeToggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? "Włącz ciemny motyw" : "Włącz jasny motyw"} title={theme === "light" ? "Ciemny motyw" : "Jasny motyw"}>
              {theme === "light" ? <Moon /> : <Sun />}
            </button>
            <span className={"status " + (s.apiKey ? "ok" : "")}>
              <i />
              {s.apiKey ? "AI gotowe" : "Wymagany klucz API"}
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
          <h2>{recording ? "Nagrywam…" : "Gotowa do słuchania"}</h2>
          <p>
            {recording
              ? "Kliknij, aby zakończyć i przepisać notatkę"
              : "Kliknij mikrofon lub użyj skrótu"}
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
                <h3>Korekta tekstu</h3>
                <p>Zaznacz tekst w dowolnej aplikacji i użyj skrótu.</p>
              </div>
            </div>
            <div className="shortcut">
              <Keyboard />
              <span>Globalny skrót</span>
              <kbd>{s.correctHotkey.replace("CommandOrControl", "Ctrl")}</kbd>
            </div>
            <button
              className="secondary"
              onClick={() => window.szeptucha.correctSelection()}
            >
              Popraw zaznaczony tekst
            </button>
          </article>
          <article>
            <div className="cardhead">
              <span className="icon amber">
                <FolderOpen />
              </span>
              <div>
                <h3>Miejsce zapisu</h3>
                <p>Każda transkrypcja trafia automatycznie tutaj.</p>
              </div>
            </div>
            <div className="folder">
              <span>{s.folder || "Nie wybrano folderu"}</span>
              <button onClick={choose}>Zmień</button>
            </div>
            <button
              className="secondary"
              onClick={() => window.szeptucha.openFolder()}
            >
              Otwórz folder
            </button>
          </article>
        </div>
        <section id="settings" className="settings">
          <div>
            <p className="eyebrow">KONFIGURACJA</p>
            <h2>Ustawienia</h2>
          </div>
          <div className="formgrid">
            <label>
              Silnik transkrypcji
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
                <option value="local">Lokalnie (Whisper, bez klucza)</option>
                <option value="openai">OpenAI / ChatGPT</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </label>
            <label>
              Format notatek
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
              Klucz API
              <div className="key">
                <input
                  type={showKey ? "text" : "password"}
                  value={s.apiKey}
                  placeholder="Wklej klucz API"
                  onChange={(e) => setS({ ...s, apiKey: e.target.value })}
                />
                <button onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            <label>
              Skrót nagrywania
              <input
                value={s.recordHotkey}
                onChange={(e) => setS({ ...s, recordHotkey: e.target.value })}
              />
            </label>
            <label>
              Skrót korekty
              <input
                value={s.correctHotkey}
                onChange={(e) => setS({ ...s, correctHotkey: e.target.value })}
              />
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
            Uruchamiaj wraz z systemem Windows
          </label>
          <button className="primary" onClick={() => save()}>
            <Check />
            Zapisz ustawienia
          </button>
        </section>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
