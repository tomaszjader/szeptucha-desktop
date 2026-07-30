import React, { useState } from "react";
import { Keyboard, X } from "lucide-react";
import { translations, type AppLanguage } from "../translations";

interface HotkeyInputProps {
  value: string;
  onChange: (newValue: string) => void;
  lang: AppLanguage;
}

export const HotkeyInput: React.FC<HotkeyInputProps> = ({ value, onChange, lang }) => {
  const [isRecording, setIsRecording] = useState(false);
  const t = translations[lang];

  const displayValue = value
    ? value
        .replace("CommandOrControl", "Ctrl")
        .replace("Control", "Ctrl")
        .replace("Key", "")
    : t.pressShortcutKeys;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setIsRecording(false);
      return;
    }

    const parts: string[] = [];

    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    const ignoreKeys = ["Control", "Shift", "Alt", "Meta", "Escape"];

    if (!ignoreKeys.includes(e.key)) {
      let keyName = e.key.toUpperCase();
      if (keyName === " ") keyName = "Space";
      parts.push(keyName);

      if (parts.length > 0) {
        onChange(parts.join("+"));
        setIsRecording(false);
      }
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
          onFocus={() => setIsRecording(true)}
          onBlur={() => setIsRecording(false)}
          onKeyDown={handleKeyDown}
          title={t.clickToRecordShortcut}
          placeholder={t.pressShortcutKeys}
        />
        {value && !isRecording && (
          <button
            type="button"
            className="clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
