import { useState, useEffect, useRef, useCallback } from "react";
import type { PlayerApi } from "./usePlayer";
import BackgroundAudio from "../lib/backgroundAudio";

/** Detect if running inside Capacitor native shell */
function isNative(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

let globalSleepEndTime: number | null = null;
let globalEndTrackMode: boolean = false;

export const SLEEP_PRESETS = [
  { label: "15 min", seconds: 15 * 60 },
  { label: "30 min", seconds: 30 * 60 },
  { label: "45 min", seconds: 45 * 60 },
  { label: "60 min", seconds: 60 * 60 },
  { label: "90 min", seconds: 90 * 60 },
  { label: "2 hrs", seconds: 120 * 60 },
];

export function useSleepTimer(player: PlayerApi, onToast: (msg: string) => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
    if (!globalSleepEndTime) return null;
    const diff = Math.round((globalSleepEndTime - Date.now()) / 1000);
    return diff > 0 ? diff : null;
  });
  const [isEndTrack, setIsEndTrack] = useState<boolean>(globalEndTrackMode);

  const playerRef = useRef(player);
  playerRef.current = player;
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  const cancelTimer = useCallback(() => {
    globalSleepEndTime = null;
    globalEndTrackMode = false;
    setSecondsLeft(null);
    setIsEndTrack(false);
    if (isNative()) {
      BackgroundAudio.cancelSleepTimer().catch(() => {});
    }
  }, []);

  const setTimer = useCallback(
    (seconds: number, endOfTrack: boolean = false) => {
      if (seconds <= 0) {
        cancelTimer();
        return;
      }
      globalSleepEndTime = Date.now() + seconds * 1000;
      globalEndTrackMode = endOfTrack;
      setSecondsLeft(seconds);
      setIsEndTrack(endOfTrack);

      if (isNative()) {
        BackgroundAudio.setSleepTimer({ seconds }).catch(() => {});
      }
    },
    [cancelTimer]
  );

  // Interval ticker
  useEffect(() => {
    if (secondsLeft === null && !globalSleepEndTime) return;

    const interval = window.setInterval(() => {
      if (!globalSleepEndTime) {
        setSecondsLeft(null);
        return;
      }
      const diff = Math.round((globalSleepEndTime - Date.now()) / 1000);
      if (diff <= 0) {
        globalSleepEndTime = null;
        globalEndTrackMode = false;
        setSecondsLeft(null);
        setIsEndTrack(false);

        if (playerRef.current.playing) {
          playerRef.current.toggle();
        }
        onToastRef.current("Sleep timer completed — playback paused");
      } else {
        setSecondsLeft(diff);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [secondsLeft]);

  // End of track detection
  useEffect(() => {
    if (!isEndTrack || !globalSleepEndTime) return;
    // If track reaches within 1 second of duration or ends
    if (
      player.duration > 0 &&
      player.time > 0 &&
      player.duration - player.time <= 1.2
    ) {
      globalSleepEndTime = null;
      globalEndTrackMode = false;
      setSecondsLeft(null);
      setIsEndTrack(false);
      if (playerRef.current.playing) {
        playerRef.current.toggle();
      }
      onToastRef.current("End of track reached — sleep timer paused playback");
    }
  }, [isEndTrack, player.time, player.duration]);

  const formatted = secondsLeft !== null ? fmtSleep(secondsLeft) : "";

  return {
    sleepSeconds: secondsLeft,
    isEndTrack,
    setTimer,
    cancelTimer,
    formatted,
  };
}

function fmtSleep(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m < 10 ? "0" : ""}${m}:${sec < 10 ? "0" : ""}${sec}`;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}
