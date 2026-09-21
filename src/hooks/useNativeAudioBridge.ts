import { useEffect, useRef } from "react";
import type { Track } from "../data/tracks";
import BackgroundAudio from "../lib/backgroundAudio";

/** Detect if running inside Capacitor native shell */
function isNative(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Bridges the web YouTube player to the native Android MusicService.
 * On native: starts a foreground service with lock-screen/notification controls,
 * updates metadata, and listens for native play/pause/next/prev commands.
 * On web: no-op (browser Media Session handles it).
 */
export function useNativeAudioBridge(
  track: Track | undefined,
  playing: boolean,
  onPlay: () => void,
  onPause: () => void,
  onNext: () => void,
  onPrev: () => void,
  onSeek?: (posSec: number) => void
) {
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);
  const onSeekRef = useRef(onSeek);
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;
  onNextRef.current = onNext;
  onPrevRef.current = onPrev;
  onSeekRef.current = onSeek;

  // Start / stop native service
  useEffect(() => {
    if (!isNative()) return;

    // Start service on mount
    BackgroundAudio.startService().catch(() => {});

    return () => {
      BackgroundAudio.stopService().catch(() => {});
    };
  }, []);

  // Update metadata when track changes
  useEffect(() => {
    if (!isNative() || !track) return;
    const rawThumb = track.thumb || track.artwork || "";
    const highRes = rawThumb.replace("hqdefault.jpg", "maxresdefault.jpg").replace("mqdefault.jpg", "maxresdefault.jpg");

    BackgroundAudio.updateMetadata({
      title: track.title || "Unknown",
      artist: track.artist || "CREEP CREEP",
      album: track.album || "CREEP CREEP",
      artworkUrl: highRes || rawThumb,
    }).catch(() => {});
  }, [track]);

  // Sync playback state to native notification
  useEffect(() => {
    if (!isNative()) return;
    BackgroundAudio.updatePlaybackState({
      state: playing ? "playing" : "paused",
    }).catch(() => {});
  }, [playing]);

  // Listen for native media commands (lock screen / notification buttons)
  useEffect(() => {
    if (!isNative()) return;

    const handleCommand = (cmd: string) => {
      if (cmd === "media-play") {
        onPlayRef.current();
      } else if (cmd === "media-pause") {
        onPauseRef.current();
      } else if (cmd === "media-next") {
        onNextRef.current();
      } else if (cmd === "media-previous") {
        onPrevRef.current();
      } else if (cmd.startsWith("media-seek:")) {
        const ms = Number(cmd.substring("media-seek:".length));
        if (!isNaN(ms)) {
          onSeekRef.current?.(ms / 1000);
        }
      }
    };

    const sub = BackgroundAudio.addListener("mediaCommand", (data) => {
      if (data?.command) handleCommand(data.command);
    });

    const windowListener = (e: any) => {
      const cmd = e.detail?.command;
      if (cmd) handleCommand(cmd);
    };
    window.addEventListener("mediaCommand", windowListener);

    return () => {
      sub.remove();
      window.removeEventListener("mediaCommand", windowListener);
    };
  }, []);
}
