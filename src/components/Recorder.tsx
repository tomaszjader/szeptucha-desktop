import React from "react";
import { Mic, StopCircle, Sparkles, Keyboard, FolderOpen } from "lucide-react";
import { translations, type AppLanguage } from "../translations";
import { useAudioLevel } from "../hooks/useAudioLevel";

interface RecorderProps {
  recording: boolean;
  onToggleRecording: () => void;
  s: Settings;
  lang: AppLanguage;
  onChangeFolder: () => void;
  onOpenFolder: () => void;
  onCorrectText: () => void;
}

export const Recorder: React.FC<RecorderProps> = ({
  recording,
  onToggleRecording,
  s,
  lang,
  onChangeFolder,
  onOpenFolder,
  onCorrectText,
}) => {
  const t = translations[lang];
  const audioLevel = useAudioLevel(recording);

  // Dynamic scale calculation based on real-time microphone volume (1.0 to 1.35)
  const orbScale = recording ? 1 + (audioLevel / 100) * 0.35 : 1;
  const glowOpacity = recording ? 0.3 + (audioLevel / 100) * 0.7 : 0.2;

  return (
    <div className="recorder-section">
      <div className={`recorder ${recording ? "recording" : ""}`}>
        <div
          className="orb"
          style={{
            transform: `scale(${orbScale})`,
            boxShadow: recording
              ? `0 0 ${20 + audioLevel * 0.5}px rgba(229, 72, 72, ${glowOpacity})`
              : undefined,
            transition: "transform 0.1s ease-out, box-shadow 0.1s ease-out",
          }}
        >
          <div
            className="rings"
            style={{
              opacity: recording ? 0.5 + (audioLevel / 100) * 0.5 : 0.3,
            }}
          />
          <button onClick={onToggleRecording} aria-label={recording ? t.recordingActive : t.readyToListen}>
            {recording ? <StopCircle /> : <Mic />}
          </button>
        </div>
        <h2>{recording ? t.recordingActive : t.readyToListen}</h2>
        <p>{recording ? t.recordingActiveDesc : t.readyToListenDesc}</p>
        
        {recording && (
          <div className="audio-meter">
            <span className="meter-label">{t.readingAudioLevel}:</span>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{ width: `${Math.max(5, audioLevel)}%` }}
              />
            </div>
          </div>
        )}

        <kbd>{(s.recordHotkey || "Ctrl+Shift+R").replace("CommandOrControl", "Ctrl")}</kbd>
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
            <kbd>{(s.correctHotkey || "Ctrl+Q").replace("CommandOrControl", "Ctrl")}</kbd>
          </div>
          <button className="secondary" onClick={onCorrectText}>
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
            <button onClick={onChangeFolder}>{t.changeBtn}</button>
          </div>
          <button className="secondary" onClick={onOpenFolder}>
            {t.openFolderBtn}
          </button>
        </article>
      </div>
    </div>
  );
};
