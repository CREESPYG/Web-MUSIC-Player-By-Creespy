import { useState, useCallback, useRef } from "react";
import { beat } from "./useBeat";

export function useAudioCapture() {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);

      beat.connectAnalyser(analyser);
      setCapturing(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Microphone/audio capture denied");
      setCapturing(false);
    }
  }, []);

  const stopCapture = useCallback(() => {
    beat.disconnectAnalyser();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setCapturing(false);
  }, []);

  const toggleCapture = useCallback(() => {
    if (capturing) stopCapture();
    else startCapture();
  }, [capturing, startCapture, stopCapture]);

  return { capturing, toggleCapture, error };
}
