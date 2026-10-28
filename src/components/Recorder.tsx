import React from "react";
import { LoaderCircle, Mic, StopCircle, Sparkles, Keyboard, FolderOpen } from "lucide-react";
import { translations, type AppLanguage } from "../translations";

function friendlyRecordingError(error: string | null, t: (typeof translations)[AppLanguage]) {
  const raw = error || "";
  const normalized = raw.toLowerCase();
  if (/(notallowed|permissiondenied|permission denied|access denied|permission)/.test(normalized)) {
    return t.microphonePermission;
  }
  if (/(notfound|devicesnotfound|no microphone|microphone.*(not|unavailable)|audio input)/.test(normalized)) {
    return t.microphoneUnavailable;
  }
  if (/(notreadable|trackstart|already in use|device busy|busy)/.test(normalized)) {
    return t.microphoneBusy;
  }
  if (/(local_model_error|transformers|whisper|onnx|model|download)/.test(normalized)) {
    return t.localModelFailed;
  }
  if (/(fetch failed|network|enotfound|econnreset|etimedout|timeout|offline)/.test(normalized)) {
    return t.networkError;
  }
  return raw || t.recordingInterrupted;
}

interface RecorderProps {
  recording: boolean;
  recordingState: RecordingStatus;
  elapsedMs: number;
  onToggleRecording: () => void;
  s: Settings;
  lang: AppLanguage;
  onChangeFolder: () => void;
  onOpenFolder: () => void;
  onCorrectText: () => void;
}

export const Recorder: React.FC<RecorderProps> = ({
  recording,
  recordingState,
  elapsedMs,
  onToggleRecording,
  s,
  lang,
  onChangeFolder,
  onOpenFolder,
  onCorrectText,
}) => {
  const t = translations[lang];
  const audioLevel = recording ? recordingState.audioLevel : 0;
  const busy = ["starting", "transcribing", "loading-model"].includes(recordingState.phase);
  const friendlyError = friendlyRecordingError(recordingState.error, t);
  const statusText = recordingState.phase === "starting"
    ? t.startingRecording
    : recordingState.phase === "loading-model"
      ? t.loadingWhisper
      : recordingState.phase === "transcribing"
        ? t.transcribingRecording
        : recordingState.phase === "error"
          ? friendlyError || t.failedToRecord
          : recording
            ? t.recordingActive
            : null;
  const formattedDuration = `${String(Math.floor(elapsedMs / 60000)).padStart(2, "0")}:${String(Math.floor(elapsedMs / 1000) % 60).padStart(2, "0")}`;
  const showDuration = recordingState.startedAt !== null
    && (recording || recordingState.durationMs > 0);
  const heading = recording ? t.recordingActive : busy ? statusText : t.readyToListen;
  const description = recording
    ? t.recordingActiveDesc
    : recordingState.phase === "error"
      ? friendlyError || t.failedToRecord
      : busy
        ? ""
        : t.readyToListenDesc;

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
          <button
            onClick={onToggleRecording}
            disabled={busy}
            aria-label={recording ? t.recordingActive : t.readyToListen}
            aria-busy={busy}
          >
            {busy ? <LoaderCircle className="recording-spinner" /> : recording ? <StopCircle /> : <Mic />}
          </button>
        </div>
        <h2 aria-live="polite">{heading}</h2>
        {description && (
          <p
            className={recordingState.phase === "error" ? "recording-error" : ""}
            role={recordingState.phase === "error" ? "alert" : undefined}
            aria-live={recordingState.phase === "error" ? "assertive" : undefined}
          >
            {description}
          </p>
        )}

        {showDuration && (
          <div className="recording-duration" aria-label={`${t.recordingDuration}: ${formattedDuration}`}>
            {t.recordingDuration}: <span>{formattedDuration}</span>
          </div>
        )}

        {recordingState.phase === "loading-model" && (
          <div className="model-progress" role="status" aria-live="polite">
            <span>{recordingState.downloadProgress === null ? t.startingWhisper : t.loadingWhisper}</span>
            {recordingState.downloadProgress === null ? (
              <div className="model-progress-track indeterminate" aria-hidden="true">
                <div className="model-progress-fill" />
              </div>
            ) : (
              <div className="model-progress-row">
                <div
                  className="model-progress-track"
                  role="progressbar"
                  aria-label={t.loadingWhisper}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={recordingState.downloadProgress}
                >
                  <div className="model-progress-fill" style={{ width: `${recordingState.downloadProgress}%` }} />
                </div>
                <span>{recordingState.downloadProgress}%</span>
              </div>
            )}
          </div>
        )}
        
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
