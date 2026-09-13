import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "../data/tracks";
import { loadYouTubeAPI, YTState } from "../lib/youtube";
import { pickMagicIndex } from "../lib/media";

export type RepeatMode = "off" | "all" | "one";
export type ShuffleMode = "off" | "random" | "magic";
export const RATES = [1, 1.25, 1.5, 0.75];

const TOPUP_AT_MS = 45_000; // start fetching similar when the track is this old

/** Create a silent audio element to keep iOS audio alive in background */
function createSilentKeepAlive(): HTMLAudioElement | null {
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

/** Update Media Session metadata + action handlers for lock-screen controls */
function updateMediaSession(track: Track | undefined, playing: boolean) {
  if (!("mediaSession" in navigator)) return;
  if (track) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Unknown",
      artist: track.artist || "CREESPY",
      album: track.album || "CREEP CREEP",
      artwork: [
        { src: track.thumb || track.artwork || "", sizes: "480x360", type: "image/jpeg" },
      ].filter((a) => a.src),
    });
  }
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
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
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        pRef.current?.pauseVideo?.();
        playingRef.current = false;
        setPlaying(false);
        stopKeepAlive();
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

    loadYouTubeAPI().then((YT: any) => {
      if (dead) return;
      host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;height:112px;pointer-events:none;opacity:0.01;";
      document.body.appendChild(host);
      const first = tracksRef.current[0]?.videoId;
      pRef.current = new YT.Player(host, {
        width: "200",
        height: "112",
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
                  pRef.current.loadVideoById(pend.id);
                } else pRef.current.cueVideoById(pend.id);
              } catch {
                /* noop */
              }
            }
          },
          onStateChange: (e: any) => {
            if (e.data === YTState.PLAYING) {
              playingRef.current = true;
              setPlaying(true);
              setBuffering(false);
              startKeepAlive();
              updateMediaSession(tracksRef.current[idxRef.current], true);
            } else if (e.data === YTState.PAUSED) {
              playingRef.current = false;
              setPlaying(false);
              setBuffering(false);
              updateMediaSession(tracksRef.current[idxRef.current], false);
            } else if (e.data === YTState.BUFFERING) {
              setBuffering(true);
            } else if (e.data === YTState.ENDED) {
              playingRef.current = false;
              setPlaying(false);
              updateMediaSession(tracksRef.current[idxRef.current], false);
              if (repeatRef.current === "one") {
                try {
                  pRef.current.seekTo(0, true);
                  pRef.current.playVideo();
                  playingRef.current = true;
                  setPlaying(true);
                  startKeepAlive();
                } catch {
                  /* noop */
                }
              } else nextRef.current(true);
            }
          },
          onError: () => {
            const now = Date.now();
            if (now - errLock.current < 4000) return;
            errLock.current = now;
            playingRef.current = false;
            setPlaying(false);
            onErrorRef.current?.("That link can't be streamed here — jumping ahead");
            skipTimer.current = window.setTimeout(() => nextRef.current(true), 1500);
          },
        },
      });
    });
    return () => {
      dead = true;
      stopKeepAlive();
      if (skipTimer.current) window.clearTimeout(skipTimer.current);
      try {
        pRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      pRef.current = null;
      host?.remove();
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

  /* ---------- progress poll + auto top-up trigger ---------- */
  useEffect(() => {
    let prevTime = 0;
    let prevBuffered = 0;
    /* Poll interval increased from 400ms → 500ms — 20% fewer re-renders */
    const id = window.setInterval(() => {
      const p = pRef.current;
      if (!p?.getCurrentTime) return;
      try {
        const t = p.getCurrentTime() || 0;
        /* Guard: only update state if time changed meaningfully (≥0.3s) */
        if (Math.abs(t - prevTime) >= 0.3) {
          prevTime = t;
          setTime(t);
        }
        const bf = p.getVideoLoadedFraction?.() || 0;
        /* Guard: only update buffered if it changed meaningfully (≥0.5%) */
        if (Math.abs(bf - prevBuffered) >= 0.005) {
          prevBuffered = bf;
          setBuffered(bf);
        }
        const d = p.getDuration?.() || 0;
        if (d > 0) {
          setDuration((prev) => (Math.abs(prev - d) < 0.2 ? prev : d));
          const cur = tracksRef.current[idxRef.current];
          if (cur) setDurations((prev) => (prev[cur.id] === d ? prev : { ...prev, [cur.id]: d }));
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
    }, 500);
    return () => window.clearInterval(id);
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
