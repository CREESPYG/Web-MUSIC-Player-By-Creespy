import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "../data/tracks";
import { loadYouTubeAPI, YTState } from "../lib/youtube";
import { pickMagicIndex } from "../lib/media";
import { persistence } from "../lib/persistence";
import { resolveAudioStream, invalidateAudioStream } from "../lib/streamResolver";

export type RepeatMode = "off" | "all" | "one";
export type ShuffleMode = "off" | "random" | "magic";
export const RATES = [1, 1.25, 1.5, 0.75];

const TOPUP_AT_MS = 45_000; // start fetching similar when the track is this old

/* ---------- shared media element (lives outside React, musike pattern) ---------- */
let sharedAudio: HTMLAudioElement | null = null;
function getAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/** Nearest playable index scanning `dir` (1 forward / -1 backward) with wrap. */
function nextPlayableIndex(list: Track[], from: number, dir: 1 | -1): number {
  const len = list.length;
  if (!len) return -1;
  for (let k = 0; k < len; k++) {
    const raw = dir === 1 ? from + k : from - k;
    const i = ((raw % len) + len) % len;
    if (list[i]?.videoId) return i;
  }
  return -1;
}

/** Check if current browser is iOS Safari where background audio needs keepalive */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Create a silent audio element to keep iOS audio alive in background (iOS only) */
function createSilentKeepAlive(): HTMLAudioElement | null {
  if (!isIOS()) return null; // Disabled on Windows/macOS/Android/Brave Desktop to avoid Audio Service decoder leaks
  try {
    const a = new Audio();
    a.loop = true;
    a.volume = 0.01;
    a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
    a.play().catch(() => {});
    return a;
  } catch {
    return null;
  }
}

/* ---------- Wake Lock API ---------- */
let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch { /* noop — unsupported or denied */ }
}
function releaseWakeLock() {
  try { wakeLock?.release(); } catch { /* noop */ }
  wakeLock = null;
}

/** Update Media Session metadata + action handlers for lock-screen controls */
function updateMediaSession(track: Track | undefined, playing: boolean, time?: number, duration?: number) {
  if (!("mediaSession" in navigator)) return;
  if (track) {
    const rawThumb = track.thumb || track.artwork || "";
    const highRes = rawThumb.replace("hqdefault.jpg", "maxresdefault.jpg").replace("mqdefault.jpg", "maxresdefault.jpg");
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Unknown",
      artist: track.artist || "CREESPY",
      album: track.album || "CREEP CREEP",
      artwork: [
        { src: highRes || rawThumb, sizes: "512x512", type: "image/jpeg" },
        { src: rawThumb, sizes: "480x360", type: "image/jpeg" },
        { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml" },
      ].filter((a) => a.src),
    });
  }
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";

  if (time != null && duration != null && duration > 0 && "setPositionState" in navigator.mediaSession) {
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(1, duration),
        playbackRate: 1,
        position: Math.min(duration, Math.max(0, time)),
      });
    } catch {
      /* noop */
    }
  }
}

/**
 * Dual-engine player, musike-style.
 *
 * Primary engine: a real HTML5 <audio> element fed with YouTube stream URLs
 * resolved server-side (see netlify/functions/innertube + streamResolver) —
 * native seeking via Range, true background audio, no iframe quirks.
 * Fallback engine: the classic hidden YouTube IFrame, used per-track when
 * stream resolution fails (region locks, odd formats, resolver outages), so
 * playback never gets worse than before.
 *
 * The public PlayerApi surface is unchanged: shuffle modes (off/random/magic),
 * auto top-up near end of mix, MediaSession, wake lock, iOS keepalive.
 */
export function usePlayer(
  tracks: Track[],
  onError?: (msg: string) => void,
  onTopUp?: () => void
) {
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const durationsRef = useRef(durations);
  durationsRef.current = durations;

  // Phase 11 — initialize playback controls from the persisted session.
  const savedPb = persistence.getPlayback();
  const savedRateIdx = RATES.indexOf(savedPb?.rate as number);
  const [volume, setVolume] = useState(savedPb?.volume ?? 80);
  const [muted, setMuted] = useState(savedPb?.muted ?? false);
  const [rateIdx, setRateIdx] = useState(savedRateIdx >= 0 ? savedRateIdx : 0);
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>(
    savedPb?.shuffleMode === "off" || savedPb?.shuffleMode === "random" ? savedPb.shuffleMode : "magic"
  );
  const [repeat, setRepeat] = useState<RepeatMode>(
    savedPb?.repeatMode === "off" || savedPb?.repeatMode === "one" ? savedPb.repeatMode : "all"
  );

  const pRef = useRef<any>(null); // iframe engine (fallback)
  const audioRef = useRef<HTMLAudioElement | null>(null); // stream engine (primary)
  const engineRef = useRef<"stream" | "iframe">("stream");
  const streamFailedRef = useRef<Set<string>>(new Set());
  const loadTokenRef = useRef(0);
  const iframePromiseRef = useRef<Promise<any> | null>(null);
  const pendingSeekRef = useRef(0);
  const idxRef = useRef(0);
  const playingRef = useRef(false);
  const shuffleRef = useRef<ShuffleMode>(savedPb?.shuffleMode === "off" || savedPb?.shuffleMode === "random" ? savedPb.shuffleMode : "magic");
  const repeatRef = useRef<RepeatMode>(savedPb?.repeatMode === "off" || savedPb?.repeatMode === "one" ? savedPb.repeatMode : "all");
  const volRef = useRef(savedPb?.volume ?? 80);
  const mutedRef = useRef(savedPb?.muted ?? false);
  const rateIdxRef = useRef(savedRateIdx >= 0 ? savedRateIdx : 0);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const startedRef = useRef(false);
  const errLock = useRef(0);
  const errCount = useRef(0);
  const skipTimer = useRef<number | null>(null);
  const pendingIframeRef = useRef<{ id: string; autoplay: boolean; token: number } | null>(null);
  const recentRef = useRef<string[]>([]);
  const topUpAtRef = useRef(0);
  const autoDoneRef = useRef<Set<string>>(new Set());
  const topUpCb = useRef(onTopUp);
  topUpCb.current = onTopUp;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const switchingRef = useRef(false); // suppresses pause-state flaps during src swaps
  const userWantsPlayRef = useRef(false);
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    shuffleRef.current = shuffleMode;
  }, [shuffleMode]);

  useEffect(() => {
    rateIdxRef.current = rateIdx;
  }, [rateIdx]);

  /* ---------- engine helpers ---------- */
  const activeTime = useCallback((): number => {
    if (engineRef.current === "iframe" && pRef.current?.getCurrentTime) {
      try { return pRef.current.getCurrentTime() || 0; } catch { return 0; }
    }
    return audioRef.current?.currentTime ?? 0;
  }, []);

  const engPlay = useCallback(() => {
    if (engineRef.current === "iframe") {
      try { pRef.current?.playVideo?.(); } catch { /* noop */ }
    } else {
      audioRef.current?.play().catch(() => {
        /* autoplay rejection handled by user gesture paths */
      });
    }
  }, []);

  const engPause = useCallback(() => {
    if (engineRef.current === "iframe") {
      try { pRef.current?.pauseVideo?.(); } catch { /* noop */ }
    } else {
      try { audioRef.current?.pause(); } catch { /* noop */ }
    }
  }, []);

  const engSeek = useCallback((t: number) => {
    if (engineRef.current === "iframe") {
      try { pRef.current?.seekTo?.(Math.max(0, t), true); } catch { /* noop */ }
    } else {
      const a = audioRef.current;
      if (a && a.readyState > 0) {
        try { a.currentTime = Math.max(0, t); } catch { /* noop */ }
      } else {
        pendingSeekRef.current = Math.max(0, t);
      }
    }
  }, []);

  const pauseBoth = useCallback(() => {
    switchingRef.current = true;
    try { pRef.current?.pauseVideo?.(); } catch { /* noop */ }
    try { audioRef.current?.pause(); } catch { /* noop */ }
    // release the suppression one tick after the pause events have fired
    window.setTimeout(() => { switchingRef.current = false; }, 80);
  }, []);

  /** Lazily create the fallback YouTube IFrame player (only when a track can't stream). */
  const getIframe = useCallback((): Promise<any> => {
    if (pRef.current) return Promise.resolve(pRef.current);
    if (iframePromiseRef.current) return iframePromiseRef.current;
    iframePromiseRef.current = new Promise<any>((resolve) => {
      loadYouTubeAPI().then((YT: any) => {
        let container = document.getElementById("youtube-player-container");
        if (!container) {
          container = document.createElement("div");
          container.id = "youtube-player-container";
          container.className = "yt-hidden"; // hidden: live background is a real <video> now
          container.setAttribute("aria-hidden", "true");
          document.body.appendChild(container);
        }
        const host = document.createElement("div");
        host.id = "youtube-player-mount";
        container.appendChild(host);
        pRef.current = new YT.Player(host, {
          width: "100%",
          height: "100%",
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: () => {
              setReady(true);
              try {
                pRef.current.setVolume(volRef.current);
                if (mutedRef.current) pRef.current.mute();
                pRef.current.setPlaybackRate?.(RATES[rateIdxRef.current]);
              } catch { /* noop */ }
              const pend = pendingIframeRef.current;
              if (pend?.id) {
                pendingIframeRef.current = null;
                try {
                  if (pend.autoplay) {
                    startedRef.current = true;
                    playingRef.current = true;
                    setPlaying(true);
                    pRef.current.loadVideoById(pend.id);
                  } else pRef.current.cueVideoById(pend.id);
                } catch { /* noop */ }
              }
              resolve(pRef.current);
            },
            onStateChange: (e: any) => {
              if (engineRef.current !== "iframe") return;
              if (e.data === YTState.PLAYING) {
                errCount.current = 0;
                playingRef.current = true;
                setPlaying(true);
                setBuffering(false);
                updateMediaSession(tracksRef.current[idxRef.current], true);
              } else if (e.data === YTState.PAUSED) {
                if (switchingRef.current) return;
                if (userWantsPlayRef.current) {
                  try { pRef.current?.playVideo?.(); } catch { /* noop */ }
                  return;
                }
                playingRef.current = false;
                setPlaying(false);
                setBuffering(false);
                updateMediaSession(tracksRef.current[idxRef.current], false);
                releaseWakeLock();
              } else if (e.data === YTState.BUFFERING) {
                setBuffering(true);
              } else if (e.data === YTState.ENDED) {
                playingRef.current = false;
                setPlaying(false);
                updateMediaSession(tracksRef.current[idxRef.current], false);
                releaseWakeLock();
                if (repeatRef.current === "one") {
                  try {
                    pRef.current.seekTo(0, true);
                    pRef.current.playVideo();
                    playingRef.current = true;
                    setPlaying(true);
                  } catch { /* noop */ }
                } else nextRef.current(true);
              }
            },
            onError: () => {
              const now = Date.now();
              if (now - errLock.current < 3000) return;
              errLock.current = now;
              playingRef.current = false;
              setPlaying(false);
              errCount.current += 1;
              if (errCount.current >= 3) {
                onErrorRef.current?.("Multiple tracks failed to load — paused");
                return;
              }
              onErrorRef.current?.("That link can't be streamed here — jumping ahead");
              skipTimer.current = window.setTimeout(() => nextRef.current(true), 1500);
            },
          },
        });
      });
    });
    return iframePromiseRef.current;
  }, []);

  /** Load a track through the fallback iframe engine. */
  const loadViaIframe = useCallback((vid: string, autoplay: boolean) => {
    engineRef.current = "iframe";
    setBuffering(autoplay);
    getIframe()
      .then((p) => {
        try {
          if (autoplay) {
            startedRef.current = true;
            playingRef.current = true;
            setPlaying(true);
            p.loadVideoById(vid);
          } else {
            playingRef.current = false;
            setPlaying(false);
            p.cueVideoById(vid);
          }
        } catch {
          pendingIframeRef.current = { id: vid, autoplay, token: loadTokenRef.current };
        }
      })
      .catch(() => {
        pendingIframeRef.current = { id: vid, autoplay, token: loadTokenRef.current };
      });
  }, [getIframe]);

  /** Load a track through the primary stream engine; fall back to the iframe on failure. */
  const cue = useCallback((i: number, autoplay: boolean) => {
    const list = tracksRef.current;
    if (!list.length) return;
    setAutoStopped(false);
    let n = ((i % list.length) + list.length) % list.length;
    // An UNRESOLVED track has no playable source (videoId) — jump to the next
    // playable one instead of silently stopping (Phase 7 unresolved handling).
    if (!list[n]?.videoId) {
      const pi = nextPlayableIndex(list, n, 1);
      if (pi === -1) {
        idxRef.current = n;
        setIndex(n);
        setTime(0);
        setBuffered(0);
        setDuration(durations[list[n]?.id] || 0);
        setPlaying(false);
        return;
      }
      n = pi;
    }
    idxRef.current = n;
    setIndex(n);
    setTime(0);
    setBuffered(0);
    setDuration(durations[list[n]?.id] || 0);
    const cur = list[n];
    if (cur) {
      recentRef.current = [...recentRef.current.filter((x) => x !== cur.id), cur.id].slice(-10);
      topUpAtRef.current = Date.now() + TOPUP_AT_MS;
      document.title = `${cur.title} — ${cur.artist} | CREEP CREEP`;
      updateMediaSession(cur, true);
    }
    const vid = cur?.videoId;
    if (!vid) return;

    const token = ++loadTokenRef.current;
    pendingSeekRef.current = 0;
    pauseBoth();

    if (autoplay) {
      userWantsPlayRef.current = true;
      startedRef.current = true;
      playingRef.current = true;
      setPlaying(true);
      try {
        persistence.addTrackToHistory(cur);
      } catch {
        /* history is best-effort; never block playback */
      }
    } else {
      userWantsPlayRef.current = false;
      playingRef.current = false;
      setPlaying(false);
    }

    if (streamFailedRef.current.has(vid)) {
      loadViaIframe(vid, autoplay);
      return;
    }

    setBuffering(autoplay);
    resolveAudioStream(vid)
      .then((info) => {
        if (token !== loadTokenRef.current) return; // stale resolve — a newer cue won
        engineRef.current = "stream";
        const a = audioRef.current;
        if (!a) throw new Error("no audio element");
        a.src = info.url;
        a.load();
        a.playbackRate = RATES[rateIdxRef.current];
        a.volume = volRef.current / 100;
        a.muted = mutedRef.current;
        if (info.durationSeconds && info.durationSeconds > 0) {
          setDuration((prev) => (Math.abs(prev - info.durationSeconds!) < 0.5 ? prev : Math.round(info.durationSeconds!)));
          setDurations((prev) => {
            const prevD = prev[cur.id];
            if (prevD != null && Math.abs(prevD - info.durationSeconds!) < 1) return prev;
            return { ...prev, [cur.id]: Math.round(info.durationSeconds!) };
          });
        }
        if (autoplay) {
          a.play().catch(() => {
            // Autoplay blocked — park intent so the next user gesture starts it.
            playingRef.current = false;
            setPlaying(false);
          });
        }
        setReady(true);
      })
      .catch(() => {
        if (token !== loadTokenRef.current) return;
        streamFailedRef.current.add(vid);
        loadViaIframe(vid, autoplay);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadViaIframe, pauseBoth]);

  /** True when repeat-off stopped a run (end of queue / all-once). Cleared by the
   *  next cue or a manual play — lets App auto-refill & resume like YouTube Music. */
  const [autoStopped, setAutoStopped] = useState(false);

  /** Repeat-off, shuffle/magic mode: count each track played once per run, then stop.
   *  Returns true when the run actually ended — the caller must NOT cue another track. */
  const endOfRunStop = (trackId: string | undefined, len: number): boolean => {
    if (trackId) autoDoneRef.current.add(trackId);
    if (autoDoneRef.current.size < len) return false;
    autoDoneRef.current.clear();
    engPause();
    playingRef.current = false;
    setPlaying(false);
    setAutoStopped(true);
    return true;
  };

  const advance = useCallback((auto: boolean) => {
    const list = tracksRef.current;
    const len = list.length;
    if (!len) return;
    const mode = shuffleRef.current;

    if (mode === "magic") {
      if (repeatRef.current === "off" && auto && endOfRunStop(list[idxRef.current]?.id, len)) return;
      cue(pickMagicIndex(list, idxRef.current, recentRef.current), true);
      return;
    }
    if (mode === "random" && len > 1) {
      if (repeatRef.current === "off" && auto && endOfRunStop(list[idxRef.current]?.id, len)) return;
      let ni = idxRef.current;
      while (ni === idxRef.current) ni = Math.floor(Math.random() * len);
      cue(ni, true);
      return;
    }
    let ni = idxRef.current + 1;
    if (ni >= len) {
      if (repeatRef.current === "off" && auto) {
        engPause();
        playingRef.current = false;
        setPlaying(false);
        setAutoStopped(true);
        return;
      }
      ni = 0;
    }
    cue(ni, true);
  }, [cue, engPause]);

  const nextRef = useRef(advance);
  nextRef.current = advance;

  /* ---------- bootstrap ---------- */
  useEffect(() => {
    let dead = false;
    let silentAudio: HTMLAudioElement | null = null;

    // iOS background audio keepalive
    const startKeepAlive = () => {
      if (!silentAudio) silentAudio = createSilentKeepAlive();
    };
    const stopKeepAlive = () => {
      if (silentAudio) {
        try { silentAudio.pause(); } catch { /* noop */ }
        silentAudio.src = "";
        silentAudio = null;
      }
    };

    // Primary engine: one shared HTMLAudioElement, wired once per mount on the
    // module-level singleton — playback survives any re-render or route change.
    // Handlers are named + unbound on cleanup so a StrictMode double-mount
    // never leaves duplicate listeners (a doubled "ended" would skip tracks).
    const a = getAudio();
    const unbind: Array<[string, EventListener]> = [];
    const onAudio = (type: string, fn: EventListener) => {
      a?.addEventListener(type, fn);
      if (a) unbind.push([type, fn]);
    };
    if (a) {
      audioRef.current = a;

      onAudio("loadedmetadata", () => {
        if (engineRef.current !== "stream" || !a) return;
        if (pendingSeekRef.current > 0 && a.readyState > 0) {
          try { a.currentTime = pendingSeekRef.current; } catch { /* noop */ }
          pendingSeekRef.current = 0;
        }
        if (Number.isFinite(a.duration) && a.duration > 0) {
          setDuration((prev) => (Math.abs(prev - a.duration) < 0.5 ? prev : Math.round(a.duration)));
        }
      });
      onAudio("playing", () => {
        if (engineRef.current !== "stream") return;
        errCount.current = 0;
        playingRef.current = true;
        setPlaying(true);
        setBuffering(false);
        startKeepAlive();
        requestWakeLock();
        updateMediaSession(tracksRef.current[idxRef.current], true);
      });
      onAudio("pause", () => {
        if (engineRef.current !== "stream" || switchingRef.current || a?.ended) return;
        // Guarantee: No auto-pause unless explicit pause action was taken by user!
        if (userWantsPlayRef.current) {
          a?.play().catch(() => {});
          return;
        }
        playingRef.current = false;
        setPlaying(false);
        setBuffering(false);
        updateMediaSession(tracksRef.current[idxRef.current], false);
        releaseWakeLock();
      });
      onAudio("waiting", () => {
        if (engineRef.current === "stream" && a && !a.paused) setBuffering(true);
      });
      onAudio("canplay", () => {
        if (engineRef.current === "stream" && userWantsPlayRef.current && a && a.paused) {
          a.play().catch(() => {});
        }
      });
      onAudio("timeupdate", () => {
        if (engineRef.current !== "stream" || !a) return;
        const nextTr = tracksRef.current[idxRef.current + 1];
        if (nextTr?.videoId && a.duration && a.currentTime > a.duration * 0.4) {
          if (!prefetchedRef.current.has(nextTr.videoId)) {
            prefetchedRef.current.add(nextTr.videoId);
            resolveAudioStream(nextTr.videoId).catch(() => {});
          }
        }
      });
      onAudio("seeked", () => {
        if (engineRef.current === "stream" && a) setTime(a.currentTime || 0);
      });
      onAudio("ended", () => {
        if (engineRef.current !== "stream") return;
        playingRef.current = false;
        setPlaying(false);
        updateMediaSession(tracksRef.current[idxRef.current], false);
        releaseWakeLock();
        if (repeatRef.current === "one") {
          try {
            if (a) a.currentTime = 0;
            a?.play().catch(() => { /* noop */ });
            playingRef.current = true;
            setPlaying(true);
            startKeepAlive();
            requestWakeLock();
          } catch { /* noop */ }
        } else nextRef.current(true);
      });
      onAudio("error", () => {
        if (engineRef.current !== "stream" || !a?.getAttribute("src")) return;
        const now = Date.now();
        if (now - errLock.current < 3000) return;
        errLock.current = now;
        const vid = tracksRef.current[idxRef.current]?.videoId;
        // Expired/403'd stream: drop the cache and hand this track to the
        // iframe engine, which resolves its own URLs.
        if (vid) invalidateAudioStream(vid);
        errCount.current += 1;
        if (errCount.current >= 3) {
          playingRef.current = false;
          setPlaying(false);
          onErrorRef.current?.("Multiple tracks failed to load — paused");
          return;
        }
        if (vid) {
          streamFailedRef.current.add(vid);
          playingRef.current = false;
          setPlaying(false);
          loadViaIframe(vid, startedRef.current);
        }
      });
      setReady(true);
    }

    // Media Session: wire action handlers for lock-screen / notification controls
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.setActionHandler("play", () => {
          startedRef.current = true;
          engPlay();
          playingRef.current = true;
          setPlaying(true);
          startKeepAlive();
          requestWakeLock();
        });
        navigator.mediaSession.setActionHandler("pause", () => {
          engPause();
          playingRef.current = false;
          setPlaying(false);
          stopKeepAlive();
          releaseWakeLock();
        });
        navigator.mediaSession.setActionHandler("previoustrack", () => {
          cue(idxRef.current - 1, true);
        });
        navigator.mediaSession.setActionHandler("nexttrack", () => {
          advance(false);
        });
        navigator.mediaSession.setActionHandler("seekbackward", () => {
          const t = activeTime();
          engSeek(Math.max(0, t - 10));
          setTime(Math.max(0, t - 10));
        });
        navigator.mediaSession.setActionHandler("seekforward", () => {
          const t = activeTime();
          engSeek(t + 10);
          setTime(t + 10);
        });
        navigator.mediaSession.setActionHandler("seekto", (details: any) => {
          if (details.seekTime != null) {
            engSeek(details.seekTime);
            setTime(details.seekTime);
          }
        });
      } catch {
        /* some engines don't support every action */
      }
    }

    /* ---------- visibility-change auto-resume ----------
     * When the tab is backgrounded or the screen locks, playback can be paused
     * by the OS. On return, detect the unexpected pause and resume so the
     * experience feels seamless. */
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (engineRef.current === "iframe") {
        const p = pRef.current;
        if (!p?.getPlayerState) return;
        const ytState = p.getPlayerState();
        if (ytState === YTState.PAUSED && playingRef.current && startedRef.current) {
          try { p.playVideo(); } catch { /* noop */ }
        }
      } else {
        const a = audioRef.current;
        if (a && a.paused && playingRef.current && startedRef.current && a.getAttribute("src")) {
          a.play().catch(() => { /* noop */ });
        }
      }
      if (playingRef.current) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopKeepAlive();
      releaseWakeLock();
      if (skipTimer.current) window.clearTimeout(skipTimer.current);
      // Unbind listeners only — the shared audio element keeps its src, so a
      // StrictMode remount (dev) or hot reload never interrupts a song.
      for (const [type, fn] of unbind) a?.removeEventListener(type, fn);
      try { pRef.current?.destroy?.(); } catch { /* noop */ }
      pRef.current = null;
      iframePromiseRef.current = null;
      const container = document.getElementById("youtube-player-container");
      container?.remove();
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
          navigator.mediaSession.setActionHandler("nexttrack", null);
          navigator.mediaSession.setActionHandler("seekbackward", null);
          navigator.mediaSession.setActionHandler("seekforward", null);
          navigator.mediaSession.setActionHandler("seekto", null);
        } catch { /* noop */ }
      }
      void dead;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- adaptive progress poll + auto top-up trigger ---------- */
  useEffect(() => {
    let prevTime = 0;
    let prevBuffered = 0;
    let pollId: number;

    const noteDurations = (d: number) => {
      if (!(d > 0) || !Number.isFinite(d)) return;
      setDuration((prev) => (Math.abs(prev - d) < 0.5 ? prev : Math.round(d)));
      const cur = tracksRef.current[idxRef.current];
      if (cur) {
        setDurations((prev) => {
          const prevD = prev[cur.id];
          if (prevD != null && Math.abs(prevD - d) < 1) return prev;
          return { ...prev, [cur.id]: Math.round(d) };
        });
      }
    };

    const poll = () => {
      try {
        if (engineRef.current === "iframe" && pRef.current?.getCurrentTime) {
          const p = pRef.current;
          const t = p.getCurrentTime() || 0;
          if (Math.abs(t - prevTime) >= 0.3) {
            prevTime = t;
            setTime(t);
            if (playingRef.current && Math.abs(t - Math.floor(t)) < 0.2) {
              updateMediaSession(tracksRef.current[idxRef.current], true, t, p.getDuration?.() || 0);
            }
          }
          const bf = p.getVideoLoadedFraction?.() || 0;
          if (Math.abs(bf - prevBuffered) >= 0.01) {
            prevBuffered = bf;
            setBuffered(bf);
          }
          noteDurations(p.getDuration?.() || 0);
        } else {
          const a = audioRef.current;
          if (a && a.getAttribute("src")) {
            const t = a.currentTime || 0;
            if (Math.abs(t - prevTime) >= 0.3) {
              prevTime = t;
              setTime(t);
              if (playingRef.current && Math.abs(t - Math.floor(t)) < 0.2) {
                updateMediaSession(tracksRef.current[idxRef.current], true, t, a.duration || 0);
              }
            }
            if (a.buffered.length && Number.isFinite(a.duration) && a.duration > 0) {
              const bf = Math.min(1, a.buffered.end(a.buffered.length - 1) / a.duration);
              if (Math.abs(bf - prevBuffered) >= 0.01) {
                prevBuffered = bf;
                setBuffered(bf);
              }
            }
            noteDurations(a.duration);
          }
        }
        // ask for similar songs while the current mix still has runway
        if (
          shuffleRef.current === "magic" &&
          playingRef.current &&
          topUpCb.current &&
          Date.now() > topUpAtRef.current &&
          tracksRef.current.length < 24
        ) {
          topUpAtRef.current = Date.now() + 45_000;
          topUpCb.current();
        }
      } catch {
        /* noop */
      }
      // Adaptive interval: 500ms when playing, 1500ms when paused (cuts background CPU by 66%)
      pollId = window.setTimeout(poll, playingRef.current ? 500 : 1500);
    };

    pollId = window.setTimeout(poll, 500);
    return () => window.clearTimeout(pollId);
  }, []);

  /* keep index valid when the queue shrinks */
  useEffect(() => {
    if (tracks.length && idxRef.current > tracks.length - 1) cue(tracks.length - 1, startedRef.current);
  }, [tracks.length, cue]);

  /* ---------- controls ---------- */
  const toggle = useCallback(() => {
    if (engineRef.current === "iframe" && !pRef.current?.playVideo) {
      // Iframe not mounted yet — park the autoplay intent.
      const cur = tracksRef.current[idxRef.current];
      if (cur?.videoId) pendingIframeRef.current = { id: cur.videoId, autoplay: true, token: loadTokenRef.current };
      return;
    }
    try {
      if (playingRef.current || userWantsPlayRef.current) {
        userWantsPlayRef.current = false;
        engPause();
        playingRef.current = false;
        setPlaying(false);
        releaseWakeLock();
      } else {
        userWantsPlayRef.current = true;
        startedRef.current = true;
        setAutoStopped(false);
        engPlay();
        playingRef.current = true;
        setPlaying(true);
        requestWakeLock();
      }
    } catch {
      /* noop */
    }
  }, [engPlay, engPause]);

  /** Explicit play — one authoritative path (state syncs via engine events). */
  const play = useCallback(() => {
    userWantsPlayRef.current = true;
    const list = tracksRef.current;
    if (!startedRef.current && list.length && list[idxRef.current]) {
      cue(idxRef.current, true);
      return;
    }
    startedRef.current = true;
    setAutoStopped(false);
    engPlay();
    requestWakeLock();
  }, [cue, engPlay]);

  /** Explicit pause — one authoritative path (state syncs via engine events). */
  const pause = useCallback(() => {
    userWantsPlayRef.current = false;
    engPause();
  }, [engPause]);

  /** Absolute mute control (Phase 8). */
  const setMute = useCallback((m: boolean) => {
    mutedRef.current = m;
    setMuted(m);
    try {
      if (audioRef.current) audioRef.current.muted = m;
      if (m) pRef.current?.mute?.();
      else pRef.current?.unMute?.();
    } catch {
      /* noop */
    }
  }, []);

  const select = useCallback(
    (i: number) => {
      if (i === idxRef.current) toggle();
      else cue(i, true);
    },
    [cue, toggle]
  );

  /**
   * Replaces the ENTIRE queue synchronously, then jumps to track `i` and
   * autoplays. This is the "Play All / Play Entire Playlist" entry point:
   * unlike `select`, it swaps tracksRef BEFORE cueing, so the first cue
   * reads the fresh queue instead of the stale cached one.
   */
  const loadAndPlay = useCallback(
    (list: Track[], i: number) => {
      if (!list.length) return;
      tracksRef.current = list;
      cue(i, true);
    },
    [cue]
  );

  const prev = useCallback(() => {
    try {
      if (activeTime() > 3) {
        engSeek(0);
        setTime(0);
        return;
      }
    } catch {
      /* noop */
    }
    const list = tracksRef.current;
    const pi = nextPlayableIndex(list, idxRef.current - 1, -1);
    cue(pi === -1 ? idxRef.current - 1 : pi, true);
  }, [cue, activeTime, engSeek]);

  const seek = useCallback((s: number) => {
    engSeek(s);
    setTime(Math.max(0, s));
  }, [engSeek]);

  const setVol = useCallback((v: number) => {
    const c = Math.max(0, Math.min(100, Math.round(v)));
    volRef.current = c;
    setVolume(c);
    if (c > 0 && mutedRef.current) {
      mutedRef.current = false;
      setMuted(false);
    }
    try {
      if (audioRef.current) {
        audioRef.current.volume = c / 100;
        audioRef.current.muted = mutedRef.current;
      }
      pRef.current?.setVolume?.(c);
      if (mutedRef.current) pRef.current?.mute?.();
      else pRef.current?.unMute?.();
    } catch {
      /* noop */
    }
  }, []);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    try {
      if (audioRef.current) audioRef.current.muted = mutedRef.current;
      if (mutedRef.current) pRef.current?.mute?.();
      else pRef.current?.unMute?.();
    } catch {
      /* noop */
    }
  }, []);

  const cycleRate = useCallback(() => {
    setRateIdx((i0) => {
      const n = (i0 + 1) % RATES.length;
      rateIdxRef.current = n;
      try {
        if (audioRef.current) audioRef.current.playbackRate = RATES[n];
        pRef.current?.setPlaybackRate?.(RATES[n]);
      } catch {
        /* noop */
      }
      return n;
    });
  }, []);

  const cycleShuffle = useCallback(() => {
    setShuffleMode((m) => (m === "off" ? "random" : m === "random" ? "magic" : "off"));
  }, []);

  const setShuffle = useCallback((m: ShuffleMode) => setShuffleMode(m), []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => {
      const n: RepeatMode = r === "off" ? "all" : r === "all" ? "one" : "off";
      repeatRef.current = n;
      if (n === "off") autoDoneRef.current.clear();
      return n;
    });
  }, []);

  return {
    ready,
    index,
    playing,
    autoStopped,
    buffering,
    time,
    duration,
    buffered,
    durations,
    volume,
    muted,
    rate: RATES[rateIdx],
    shuffleMode,
    repeat,
    toggle,
    play,
    pause,
    select,
    loadAndPlay,
    cue,
    setMute,
    next: () => advance(false),
    prev,
    seek,
    setVol,
    toggleMute,
    cycleRate,
    cycleShuffle,
    setShuffle,
    cycleRepeat,
    afterRemove,
    afterReorder,
  };

  /** Queue housekeeping after reordering; preserves active playing index. */
  function afterReorder(from: number, to: number, nextList: Track[]) {
    tracksRef.current = nextList;
    if (idxRef.current === from) {
      idxRef.current = to;
      setIndex(to);
    } else if (from < idxRef.current && to >= idxRef.current) {
      idxRef.current -= 1;
      setIndex(idxRef.current);
    } else if (from > idxRef.current && to <= idxRef.current) {
      idxRef.current += 1;
      setIndex(idxRef.current);
    }
  }

  /** Queue housekeeping after a removal; uses the post-removal list. */
  function afterRemove(removed: number, nextList: Track[]) {
    const prevList = tracksRef.current;
    const removedTrack = prevList[removed];
    tracksRef.current = nextList;
    if (removed < idxRef.current) {
      idxRef.current -= 1;
      setIndex(idxRef.current);
    } else if (removed === idxRef.current) {
      if (nextList.length <= 0) return;
      // Clear-Queue flow: the "removed" entry is still present (kept as current)
      // — just retarget the index WITHOUT reloading so playback continues seamlessly.
      if (removedTrack && nextList.some((t) => t.id === removedTrack.id)) {
        const keepAt = nextList.findIndex((t) => t.id === removedTrack.id);
        idxRef.current = keepAt;
        setIndex(keepAt);
        return;
      }
      const ni = Math.min(idxRef.current, nextList.length - 1);
      idxRef.current = ni;
      setIndex(ni);
      setTime(0);
      cue(ni, startedRef.current);
    }
  }
}

export type PlayerApi = ReturnType<typeof usePlayer>;
