import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { translations, type AppLanguage } from "../translations";
import { formatShortcut } from "../utils/formatShortcut.mjs";
import { shortcutKey } from "../utils/shortcutKey.mjs";

interface HotkeyInputProps {
  value: string;
  onChange: (newValue: string) => void;
  lang: AppLanguage;
}

export const HotkeyInput: React.FC<HotkeyInputProps> = ({ value, onChange, lang }) => {
  const [isRecording, setIsRecording] = useState(false);
  const t = translations[lang];
  const captureToken = useRef<string | null>(null);
  const releaseCapture = useCallback(() => {
    if (captureToken.current) window.szeptucha.endShortcutCapture(captureToken.current);
    captureToken.current = null;
  }, []);
  const stopCapture = useCallback(() => {
    releaseCapture();
    setIsRecording(false);
  }, [releaseCapture]);
  const startCapture = () => {
    if (!captureToken.current) {
      captureToken.current = crypto.randomUUID();
      window.szeptucha.beginShortcutCapture(captureToken.current);
    }
    setIsRecording(true);
  };
  useEffect(() => {
    const hidden = () => { if (document.hidden) stopCapture(); };
    window.addEventListener("blur", stopCapture);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", stopCapture);
      document.removeEventListener("visibilitychange", hidden);
      releaseCapture();
    };
  }, [releaseCapture, stopCapture]);

  const displayValue = value ? formatShortcut(value) : t.pressShortcutKeys;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Leave plain Tab/Shift+Tab to the browser; blur ends capture after focus moves.
    if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      stopCapture();
      return;
    }
    if (!captureToken.current) {
      // After acceptance/cancellation, capture again only on an explicit action.
      if (e.key === "Enter" || e.key === " ") startCapture();
      return;
    }

    const parts: string[] = [];

    if (e.ctrlKey) parts.push("Control");
    if (e.metaKey) parts.push("Super");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    const keyName = shortcutKey(e.key);
    if (keyName) {
      parts.push(keyName);
      onChange(parts.join("+"));
      stopCapture();
    }
  };

  return (
    <div className={`hotkey-recorder ${isRecording ? "active" : ""}`}>
      <div className="hotkey-display">
        <Keyboard size={16} />
        <input
          readOnly
          type="text"
          value={isRecording ? t.pressShortcutKeys : displayValue}
          onFocus={startCapture}
          onClick={startCapture}
          onBlur={stopCapture}
          onKeyDown={handleKeyDown}
          title={t.clickToRecordShortcut}
          placeholder={t.pressShortcutKeys}
        />
        {value && !isRecording && (
          <button
            type="button"
            className="clear-btn"
            aria-label={t.clearShortcut}
            title={t.clearShortcut}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};
