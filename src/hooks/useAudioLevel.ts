import { useEffect, useState } from "react";

export function useAudioLevel(isRecording: boolean): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setLevel(0);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let stream: MediaStream | null = null;
    let animId: number | null = null;

    async function initAudio() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;

        microphone = audioCtx.createMediaStreamSource(stream);
        microphone.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          // Scale average (0-255) to 0-100 percentage
          const normalized = Math.min(100, Math.round((average / 128) * 100));
          setLevel(normalized);
          animId = requestAnimationFrame(updateLevel);
        };

        updateLevel();
      } catch {
        setLevel(0);
      }
    }

    initAudio();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (microphone) microphone.disconnect();
      if (audioCtx && audioCtx.state !== "closed") audioCtx.close();
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [isRecording]);

  return level;
}
