import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "../data/tracks";
import { loadYouTubeAPI, YTState } from "../lib/youtube";
import { pickMagicIndex } from "../lib/media";

export type RepeatMode = "off" | "all" | "one";
export type ShuffleMode = "off" | "random" | "magic";
export const RATES = [1, 1.25, 1.5, 0.75];

const TOPUP_AT_MS = 45_000; // start fetching similar when the track is this old

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
 * Single hidden YouTube player, re-pointed with loadVideoById.
 * Adds shuffle modes (off / random / magic) plus auto top-up: when magic
 * shuffle is on and the current mix is nearing its end, onTopUp() is fired so
 * the app can append similar songs and playback never has to repeat.
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
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [rateIdx, setRateIdx] = useState(0);
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>("magic");
  const [repeat, setRepeat] = useState<RepeatMode>("all");

  const pRef = useRef<any>(null);
  const idxRef = useRef(0);
  const playingRef = useRef(false);
  const shuffleRef = useRef<ShuffleMode>("magic");
  const repeatRef = useRef<RepeatMode>("all");
  const volRef = useRef(80);
  const mutedRef = useRef(false);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const startedRef = useRef(false);
  const errLock = useRef(0);
  const errCount = useRef(0);
  const skipTimer = useRef<number | null>(null);
  const pendingRef = useRef<{ id: string; autoplay: boolean } | null>(null);
  const recentRef = useRef<string[]>([]);
  const topUpAtRef = useRef(0);
  const topUpCb = useRef(onTopUp);
  topUpCb.current = onTopUp;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    shuffleRef.current = shuffleMode;
  }, [shuffleMode]);

  const cue = useCallback((i: number, autoplay: boolean) => {
    const list = tracksRef.current;
    if (!list.length) return;
    const n = ((i % list.length) + list.length) % list.length;
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
    const p = pRef.current;
    const vid = cur?.videoId;
    if (!p || !vid) {
      pendingRef.current = { id: vid, autoplay };
      return;
    }
    try {
      if (autoplay) {
        startedRef.current = true;
        playingRef.current = true;
        setPlaying(true);
        setBuffering(true);
        p.loadVideoById(vid);
      } else {
        p.cueVideoById(vid);
      }
    } catch {
      pendingRef.current = { id: vid, autoplay };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = useCallback((auto: boolean) => {
    const list = tracksRef.current;
    const len = list.length;
    if (!len) return;
    const mode = shuffleRef.current;

    if (mode === "magic") {
      cue(pickMagicIndex(list, idxRef.current, recentRef.current), true);
      return;
    }
    if (mode === "random" && len > 1) {
      let ni = idxRef.current;
      while (ni === idxRef.current) ni = Math.floor(Math.random() * len);
      cue(ni, true);
      return;
    }
    let ni = idxRef.current + 1;
    if (ni >= len) {
      if (repeatRef.current === "off" && auto) {
        try {
          pRef.current?.pauseVideo?.();
        } catch {
          /* noop */
        }
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      ni = 0;
    }
    cue(ni, true);
  }, [cue]);

  const nextRef = useRef(advance);
  nextRef.current = advance;

  /* ---------- bootstrap ---------- */
  useEffect(() => {
    let dead = false;
    let host: HTMLElement | null = null;
    let silentAudio: HTMLAudioElement | null = null;

    // iOS background audio keepalive
    const startKeepAlive = () => {
      if (!silentAudio) silentAudio = createSilentKeepAlive();
    };
    const stopKeepAlive = () => {
      if (silentAudio) {
        try { silentAudio.pause(); } catch {}
        silentAudio.src = "";
        silentAudio = null;
      }
    };

    // Media Session: wire action handlers for lock-screen / notification controls
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => {
        startedRef.current = true;
        pRef.current?.playVideo?.();
        playingRef.current = true;
        setPlaying(true);
        startKeepAlive();
        requestWakeLock();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        pRef.current?.pauseVideo?.();
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
      navigator.mediaSession.setActionHandler("seekto", (details: any) => {
        if (details.seekTime != null) {
          pRef.current?.seekTo?.(details.seekTime, true);
          setTime(details.seekTime);
        }
      });
    }

    let container: HTMLElement | null = null;
    loadYouTubeAPI().then((YT: any) => {
      if (dead) return;
      container = document.getElementById("youtube-player-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "youtube-player-container";
        let isLiveBg = false;
        try {
          const raw = localStorage.getItem("ripple.settings.v1");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.bgStyle === "live") isLiveBg = true;
          }
        } catch {}
        container.className = isLiveBg ? "yt-live-bg" : "yt-hidden";
        container.setAttribute("aria-hidden", "true");
        document.body.appendChild(container);
      }
      host = document.createElement("div");
      host.id = "youtube-player-mount";
      container.appendChild(host);
      const first = tracksRef.current[0]?.videoId;
      pRef.current = new YT.Player(host, {
        width: "100%",
        height: "100%",
        videoId: first,
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0 },
        events: {
          onReady: () => {
            setReady(true);
            try {
              pRef.current.setVolume(volRef.current);
              if (mutedRef.current) pRef.current.mute();
            } catch {
              /* noop */
            }
            const pend = pendingRef.current;
            if (pend?.id) {
              pendingRef.current = null;
              try {
                if (pend.autoplay) {
                  startedRef.current = true;
                  playingRef.current = true;
                  setPlaying(true);
                  startKeepAlive();
                  requestWakeLock();
                  pRef.current.loadVideoById(pend.id);
                } else pRef.current.cueVideoById(pend.id);
              } catch {
                /* noop */
              }
            }
          },
          onStateChange: (e: any) => {
            if (e.data === YTState.PLAYING) {
              errCount.current = 0;
              playingRef.current = true;
              setPlaying(true);
              setBuffering(false);
              startKeepAlive();
              requestWakeLock();
              updateMediaSession(tracksRef.current[idxRef.current], true);
            } else if (e.data === YTState.PAUSED) {
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
                  startKeepAlive();
                  requestWakeLock();
                } catch {
                  /* noop */
                }
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

    /* ---------- visibility-change auto-resume ----------
     * On Android Chrome, YouTube iframes are paused when the tab is backgrounded
     * or the screen locks. When the user returns, detect the unexpected pause and
     * resume playback automatically so the experience feels seamless. */
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const p = pRef.current;
      if (!p?.getPlayerState) return;
      const ytState = p.getPlayerState();
      // If the player is paused but we think it should be playing, resume
      if (ytState === YTState.PAUSED && playingRef.current && startedRef.current) {
        try {
          p.playVideo();
        } catch { /* noop */ }
      }
      // Re-acquire wake lock if we're playing
      if (playingRef.current) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopKeepAlive();
      releaseWakeLock();
      if (skipTimer.current) window.clearTimeout(skipTimer.current);
      try {
        pRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      pRef.current = null;
      host?.remove();
      container?.remove();
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
          navigator.mediaSession.setActionHandler("nexttrack", null);
          navigator.mediaSession.setActionHandler("seekto", null);
        } catch {}
      }
    };
  }, []);

  /* ---------- adaptive progress poll + auto top-up trigger ---------- */
  useEffect(() => {
    let prevTime = 0;
    let prevBuffered = 0;
    let pollId: number;

    const poll = () => {
      const p = pRef.current;
      if (p?.getCurrentTime) {
        try {
          const t = p.getCurrentTime() || 0;
          /* Guard: only update state if time changed meaningfully (≥0.3s) */
          if (Math.abs(t - prevTime) >= 0.3) {
            prevTime = t;
            setTime(t);
            if (playingRef.current && Math.abs(t - Math.floor(t)) < 0.2) {
              updateMediaSession(tracksRef.current[idxRef.current], true, t, p.getDuration?.() || 0);
            }
          }
          const bf = p.getVideoLoadedFraction?.() || 0;
          /* Guard: only update buffered if it changed meaningfully (≥0.01) */
          if (Math.abs(bf - prevBuffered) >= 0.01) {
            prevBuffered = bf;
            setBuffered(bf);
          }
          const d = p.getDuration?.() || 0;
          if (d > 0) {
            setDuration((prev) => (Math.abs(prev - d) < 0.5 ? prev : Math.round(d)));
            const cur = tracksRef.current[idxRef.current];
            if (cur) {
              setDurations((prev) => {
                const prevD = prev[cur.id];
                if (prevD != null && Math.abs(prevD - d) < 1) return prev;
                return { ...prev, [cur.id]: Math.round(d) };
              });
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
    const p = pRef.current;
    if (!p?.playVideo) return;
    try {
      if (playingRef.current) {
        p.pauseVideo();
      } else {
        startedRef.current = true;
        p.playVideo();
        requestWakeLock();
      }
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

  const prev = useCallback(() => {
    const p = pRef.current;
    try {
      if (p?.getCurrentTime?.() > 3) {
        p.seekTo(0, true);
        setTime(0);
        return;
      }
    } catch {
      /* noop */
    }
    cue(idxRef.current - 1, true);
  }, [cue]);

  const seek = useCallback((s: number) => {
    const p = pRef.current;
    try {
      p?.seekTo?.(Math.max(0, s), true);
      setTime(Math.max(0, s));
    } catch {
      /* noop */
    }
  }, []);

  const setVol = useCallback((v: number) => {
    const c = Math.max(0, Math.min(100, Math.round(v)));
    volRef.current = c;
    setVolume(c);
    if (c > 0 && mutedRef.current) {
      mutedRef.current = false;
      setMuted(false);
    }
    try {
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
      if (mutedRef.current) pRef.current?.mute?.();
      else pRef.current?.unMute?.();
    } catch {
      /* noop */
    }
  }, []);

  const cycleRate = useCallback(() => {
    setRateIdx((i0) => {
      const n = (i0 + 1) % RATES.length;
      try {
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
      return n;
    });
  }, []);

  return {
    ready,
    index,
    playing,
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
    select,
    cue,
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
    tracksRef.current = nextList;
    if (removed < idxRef.current) {
      idxRef.current -= 1;
      setIndex(idxRef.current);
    } else if (removed === idxRef.current) {
      if (nextList.length <= 0) return;
      const ni = Math.min(idxRef.current, nextList.length - 1);
      idxRef.current = ni;
      setIndex(ni);
      setTime(0);
      cue(ni, startedRef.current);
    }
  }
}

export type PlayerApi = ReturnType<typeof usePlayer>;
