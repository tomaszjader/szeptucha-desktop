import React from "react";
import { Mic, Settings as SettingsIcon, ShieldCheck, AudioLines, History as HistoryIcon } from "lucide-react";
import { translations } from "../translations";

interface SidebarProps {
  currentTab: "recording" | "history" | "settings";
  setCurrentTab: (tab: "recording" | "history" | "settings") => void;
  lang: "pl" | "en";
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, lang }) => {
  const t = translations[lang];

  return (
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
        <button
          className={currentTab === "recording" ? "active" : ""}
          onClick={() => setCurrentTab("recording")}
        >
          <Mic />
          {t.navRecording}
        </button>
        <button
          className={currentTab === "history" ? "active" : ""}
          onClick={() => setCurrentTab("history")}
        >
          <HistoryIcon />
          {t.navHistory}
        </button>
        <button
          className={currentTab === "settings" ? "active" : ""}
          onClick={() => setCurrentTab("settings")}
        >
          <SettingsIcon />
          {t.navSettings}
        </button>
      </nav>
      <div className="privacy">
        <ShieldCheck />
        <div>
          <b>{t.privacyTitle}</b>
          <small>{t.privacyText}</small>
        </div>
      </div>
      <span className="version">Szeptucha 0.1.0</span>
    </aside>
  );
};
