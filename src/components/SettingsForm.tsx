import React, { useState } from "react";
import { Check, Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { translations, type AppLanguage } from "../translations";
import { HotkeyInput } from "./HotkeyInput";

interface SettingsFormProps {
  s: Settings;
  setS: React.Dispatch<React.SetStateAction<Settings>>;
  onSave: (next?: Settings) => void;
  lang: AppLanguage;
}

export const SettingsForm: React.FC<SettingsFormProps> = ({ s, setS, onSave, lang }) => {
  const [showKey, setShowKey] = useState(false);
  const t = translations[lang];

  return (
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
            onChange={(e) => {
              const provider = e.target.value as Settings["provider"];
              setS({
                ...s,
                provider,
                model:
                  provider === "openai"
                    ? "gpt-4o-mini-transcribe"
                    : provider === "gemini"
                      ? "gemini-2.0-flash"
                      : s.whisperModel || "whisper-tiny",
              });
            }}
          >
            <option value="local">{t.localWhisper}</option>
            <option value="openai">{t.openai}</option>
            <option value="gemini">{t.gemini}</option>
          </select>
        </label>

        {s.provider === "local" && (
          <label>
            {t.whisperModelLabel}
            <select
              value={s.whisperModel || "whisper-tiny"}
              onChange={(e) =>
                setS({
                  ...s,
                  whisperModel: e.target.value as Settings["whisperModel"],
                  model: e.target.value,
                })
              }
            >
              <option value="whisper-tiny">{t.whisperTiny}</option>
              <option value="whisper-base">{t.whisperBase}</option>
              <option value="whisper-small">{t.whisperSmall}</option>
            </select>
          </label>
        )}

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
          <HotkeyInput
            value={s.recordHotkey}
            onChange={(val) => setS({ ...s, recordHotkey: val })}
            lang={lang}
          />
        </label>

        <label>
          {t.correctionShortcut}
          <HotkeyInput
            value={s.correctHotkey}
            onChange={(val) => setS({ ...s, correctHotkey: val })}
            lang={lang}
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
            <option value="de">{t.langDe}</option>
            <option value="ru">{t.langRu}</option>
          </select>
        </label>

        <label>
          {t.recordingLanguage}
          <select
            value={s.language || "auto"}
            onChange={(e) => setS({ ...s, language: e.target.value })}
          >
            <option value="auto">{t.langAuto}</option>
            <option value="pl">{t.langPl}</option>
            <option value="en">{t.langEn}</option>
            <option value="de">{t.langDe}</option>
            <option value="ru">{t.langRu}</option>
          </select>
        </label>
      </div>

      <div className="toggles-group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={s.soundEnabled ?? true}
            onChange={(e) => setS({ ...s, soundEnabled: e.target.checked })}
          />
          <span />
          <div className="toggle-label-with-icon">
            {s.soundEnabled ?? true ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {t.soundEnabled}
          </div>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={s.launchAtStartup}
            onChange={(e) => setS({ ...s, launchAtStartup: e.target.checked })}
          />
          <span />
          {t.launchAtStartup}
        </label>
      </div>

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

      <button className="primary" onClick={() => onSave()}>
        <Check />
        {t.saveSettingsBtn}
      </button>
    </section>
  );
};
