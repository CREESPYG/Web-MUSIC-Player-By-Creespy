import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { THEMES } from "./themes";
import { TRACKS } from "./data/tracks";
import {
  fetchSimilar,
  fetchTrackMeta,
  loadCustomTracks,
  makeTrack,
  parseYouTubeId,
  parsePlaylistId,
  saveCustomTracks,
  type Track,
} from "./lib/media";
import { loadYouTubePlaylist } from "./lib/playlist";
import { fetchWeather, getPinnedPlace, pinPlace, type Place, type WeatherNow } from "./lib/weather";
import {
  addBgMedia,
  clearBgMedia,
  deleteBgItem,
  getLibrary,
  openActiveBg,
  openBgItem,
  setActiveBg,
  type BgItem,
  type BgLibrary,
} from "./lib/bgStore";
import { usePlayer, type PlayerApi } from "./hooks/usePlayer";
import { useLiveBgVideo } from "./hooks/useLiveBgVideo";
import { useBeatDriver } from "./hooks/useBeat";
import { usePresence } from "./hooks/usePresence";
import { useOnline } from "./hooks/useOnline";
import { useSettings } from "./hooks/useSettings";
import { useNativeAudioBridge } from "./hooks/useNativeAudioBridge";
import { BackgroundCanvas } from "./components/BackgroundCanvas";
import { RippleLayer } from "./components/RippleLayer";
import { MediaLayer } from "./components/MediaLayer";
import { TopBar, type ViewMode } from "./components/TopBar";
import { DiscStage } from "./components/DiscStage";
import { Controls } from "./components/Controls";
import { Playlist } from "./components/Playlist";
import { ClockCard } from "./components/Clock";
import { TimeScreen } from "./components/TimeScreen";
import { CustomizePanel } from "./components/CustomizePanel";
import { RoomPanel } from "./components/RoomPanel";
import { SearchModal } from "./components/SearchModal";
import { HistoryView } from "./components/HistoryView";
import { LibraryScreen } from "./components/LibraryScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BackgroundImportWindow } from "./components/BackgroundImportWindow";
import { useRoom } from "./hooks/useRoom";
import { readInviteCode, type PlaybackState } from "./lib/room";
import { Toasts, type Toast } from "./components/Toasts";
import { ListMusicIcon, ClockOnlyIcon } from "./components/UiIcons";
import { cn } from "./utils/cn";
import { persistence } from "./lib/persistence";
import { deriveAccents } from "./lib/color";
import { requestMobileTab } from "./lib/mobileNavBus";
import { requestOpenPlaylist } from "./lib/openPlaylistBus";
import type { ScreenId } from "./lib/screens";
import { initMemoryOptimizer, setMemoryGovernorPlayerActive, trackBlobUrl, untrackBlobUrl } from "./lib/memoryManager";
import { MobileShell } from "./components/mobile/MobileShell";

type MobileTab = "queue" | "clock";

/** Dedup/sync key that survives unresolved tracks (no videoId yet). */
function queueKey(t: Track): string {
  return t.videoId ? `v:${t.videoId}` : t.id ? `id:${t.id}` : `u:${t.sourceUrl || ""}`;
}

export default function App() {
  /* ---------------- memory lifecycle manager ---------------- */
  useEffect(() => {
    return initMemoryOptimizer();
  }, []);

  /* ---------------- cleanup toast timers on unmount ---------------- */
  useEffect(() => () => toastTimersRef.current.forEach(window.clearTimeout), []);

  /* ---------------- theme ---------------- */
  const [themeId, setThemeId] = useState<string>(() => localStorage.getItem("ripple-theme") || THEMES[0].id);
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const applyTheme = useCallback((id: string) => {
    setThemeId(id);
    try {
      localStorage.setItem("ripple-theme", id);
    } catch {
      /* noop */
    }
  }, []);

  /* ---------------- toasts ---------------- */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimersRef = useRef<number[]>([]);
  const pushToast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, msg }]);
    toastTimersRef.current.push(window.setTimeout(() => {
      setToasts((ts) => ts.filter((t) => t.id !== id));
    }, 2800));
  }, []);

  /* ---------------- queue & tracks ---------------- */
  const [tracks, setTracks] = useState<Track[]>(() => {
    const custom = loadCustomTracks();
    return custom.length ? [...TRACKS, ...custom] : TRACKS;
  });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [similarLive, setSimilarLive] = useState<boolean | null>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const playerRef = useRef<PlayerApi | null>(null);
  const isOnline = useOnline();

  /* ---- Phase 15 — announce connectivity transitions once each way ---- */
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (prevOnlineRef.current === isOnline) return;
    prevOnlineRef.current = isOnline;
    pushToast(
      isOnline
        ? "Back online — live discovery resumed"
        : "Offline — discovery and Up Next are paused",
    );
  }, [isOnline, pushToast]);

  const addTrack = useCallback(
    async (url: string) => {
      const trimmed = url.trim();

      // Check if it's a YouTube Playlist link
      const playlistId = parsePlaylistId(trimmed);
      if (playlistId) {
        setAddBusy(true);
        setAddError(null);
        pushToast("Loading playlist tracks…");
        try {
          const list = await loadYouTubePlaylist(playlistId);
          if (!list || list.length === 0) {
            setAddError("No tracks found in playlist (may be private)");
            pushToast("Could not load playlist");
            setAddBusy(false);
            return;
          }
          // Filter duplicates against existing queue
          const existingIds = new Set(tracksRef.current.map((t) => t.videoId));
          const newTracks = list.filter((t) => !existingIds.has(t.videoId));
          if (newTracks.length === 0) {
            setAddError("All playlist tracks are already in queue");
            pushToast("Playlist tracks already queued");
            setAddBusy(false);
            return;
          }
          setTracks((prev) => {
            const next = [...prev, ...newTracks];
            saveCustomTracks(next);
            if (roomRef.current?.inRoom) {
              if (roomRef.current.isHost) {
                roomRef.current.broadcastQueue(next);
              } else {
                newTracks.forEach((nt) => roomRef.current?.addQueueTrack(nt));
              }
            }
            return next;
          });
          setAddBusy(false);
          pushToast(`Added ${newTracks.length} tracks with album art sync!`);
          return;
        } catch {
          const fallbackVid = parseYouTubeId(trimmed);
          if (!fallbackVid) {
            setAddError("Could not load playlist (check link or try again)");
            pushToast("Failed to load playlist");
            setAddBusy(false);
            return;
          }
        }
      }

      // Single track loading
      const videoId = parseYouTubeId(trimmed);
      if (!videoId) {
        setAddError("Please paste a valid YouTube video or playlist URL");
        pushToast("Couldn't read that YouTube link");
        return;
      }
      if (tracksRef.current.some((t) => t.videoId === videoId)) {
        setAddError("Already in your queue");
        pushToast("That track is already queued");
        return;
      }
      setAddBusy(true);
      setAddError(null);
      const meta = await fetchTrackMeta(videoId);
      const track = makeTrack(videoId, meta.title, meta.artist, "Added by you", "custom", meta.duration);
      setTracks((prev) => {
        const next = [...prev, track];
        saveCustomTracks(next);
        if (roomRef.current?.inRoom) {
          if (roomRef.current.isHost) {
            roomRef.current.broadcastQueue(next);
          } else {
            roomRef.current.addQueueTrack(track);
          }
        }
        return next;
      });
      setAddBusy(false);
      pushToast(`Added — ${track.title}`);
    },
    [pushToast]
  );

  const removeTrack = useCallback(
    (i: number) => {
      const next = tracksRef.current.filter((_, k) => k !== i);
      if (next.length === tracksRef.current.length) return;
      pushToast(`Removed — ${tracksRef.current[i].title}`);
      setTracks(next);
      saveCustomTracks(next);
      playerRef.current?.afterRemove(i, next);
      if (roomRef.current?.inRoom && roomRef.current.isHost) {
        roomRef.current.broadcastQueue(next);
      }
    },
    [pushToast]
  );

  /** Clear the queue but keep the currently loaded track playing (seamless). */
  const clearQueue = useCallback(() => {
    const idx = playerRef.current?.index ?? 0;
    const cur = tracksRef.current[idx];
    if (!tracksRef.current.length || !cur) {
      pushToast("Queue is already empty");
      return;
    }
    const next = [cur];
    setTracks(next);
    saveCustomTracks(next);
    playerRef.current?.afterRemove(idx, next);
    if (roomRef.current?.inRoom && roomRef.current.isHost) {
      roomRef.current.broadcastQueue(next);
    }
    pushToast("Queue cleared — kept the current track");
  }, [pushToast]);

  const topUpSimilar = useCallback(
    async (announce = false) => {
      if (similarBusy) return;
      const cur = tracksRef.current[playerRef.current?.index ?? 0];
      if (!cur) return;
      if (!navigator.onLine) {
        setSimilarLive(false);
        return;
      }
      setSimilarBusy(true);
      const known = new Set(tracksRef.current.map((t) => t.videoId));
      const { tracks: found, live } = await fetchSimilar(cur.videoId, known, 4, cur);
      setSimilarLive(live);
      if (found.length) {
        setTracks((prev) => {
          const merged = [...prev];
          found.forEach((f) => {
            if (!merged.some((m) => m.videoId === f.videoId)) merged.push(f);
          });
          saveCustomTracks(merged);
          return merged;
        });
        if (announce) pushToast(`Added ${found.length} similar mix${found.length === 1 ? "" : "es"}`);
      } else if (announce) {
        pushToast(live ? "No new similar mixes found" : "Discovery offline — magic shuffle is active");
      }
      setSimilarBusy(false);
    },
    [pushToast, similarBusy]
  );

  /* ---------------- player + visuals ---------------- */
  const player = usePlayer(tracks, pushToast, () => topUpSimilar(false));
  playerRef.current = player;
  const track = tracks[player.index] ?? tracks[0];

  /* ---------------- Phase 10 — "Up Next" auto-queue -----------------------
   * While the user is listening and the queue is about to run out (regular
   * shuffle modes), fetch ONE suggestion and append it. Veto = remove it from
   * the queue (existing trash button). Toggle lives in Settings (persisted, so
   * it survives refresh). The known-set includes the whole queue PLUS recently
   * played history so a suggested track can never immediately replay itself.
   * Appending via setTracks never interrupts current playback. */
  const upNextAtRef = useRef(0);
  useEffect(() => {
    if (!player.playing) return;
    if (!isOnline) return;
    if (player.shuffleMode === "magic") return; // magic has its own 24-slot top-up
    if (!persistence.getPreferences().autoQueue) return;
    if (similarBusy) return;
    const remaining = tracks.length - (player.index + 1);
    if (remaining > 2) return;
    const cur = tracksRef.current[player.index];
    if (!cur?.videoId) return;
    if (Date.now() < upNextAtRef.current) return;
    upNextAtRef.current = Date.now() + 20_000;

    const known = new Set<string>();
    tracksRef.current.forEach((t) => {
      if (t.videoId) known.add(t.videoId);
      if (t.sourceTrackId) known.add(`st:${t.sourceTrackId}`);
    });
    persistence
      .getTrackHistory()
      .slice(0, 30)
      .forEach((h) => {
        if (h.track.videoId) known.add(h.track.videoId);
      });

    fetchSimilar(cur.videoId, known, 1, cur)
      .then(({ tracks: found }) => {
        if (!found.length) return;
        setTracks((prev) => {
          const next = [...prev];
          for (const f of found) {
            const exists = next.some(
              (m) =>
                m.videoId === f.videoId ||
                (f.sourceTrackId && m.sourceTrackId === f.sourceTrackId)
            );
            if (!exists) next.push(f);
          }
          saveCustomTracks(next);
          return next;
        });
        pushToast(`Up Next: "${found[0].title}"`);
      })
      .catch(() => {
        /* discovery offline — stay silent in auto mode */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.playing, player.shuffleMode, player.index, tracks.length, similarBusy, isOnline]);

  /* ---------------- Autoplay resume (YouTube-Music style) -----------------------
   * When repeat-off stops a run (end of queue, or all tracks played once under
   * magic/random), fetch a fresh batch of discoveries and keep the session
   * going automatically. Gated on online + auto-queue/auto-discovery prefs so a
   * purely manual listening session is never interrupted. */
  const resumeAtRef = useRef(0);
  useEffect(() => {
    if (player.playing) return;
    if (!player.autoStopped) return; // only resume after an auto stop (not user pause)
    if (!isOnline) return;
    if (!persistence.getPreferences().autoQueue && player.shuffleMode === "off") return;
    if (similarBusy) return;
    if (!tracks.length) return;
    if (Date.now() < resumeAtRef.current) return;
    resumeAtRef.current = Date.now() + 12_000;
    const cur = tracksRef.current[player.index];
    if (!cur?.videoId) return;

    const known = new Set<string>();
    tracksRef.current.forEach((t) => {
      if (t.videoId) known.add(t.videoId);
      if (t.sourceTrackId) known.add(`st:${t.sourceTrackId}`);
    });
    persistence
      .getTrackHistory()
      .slice(0, 30)
      .forEach((h) => {
        if (h.track.videoId) known.add(h.track.videoId);
      });

    fetchSimilar(cur.videoId, known, 4, cur)
      .then(({ tracks: found }) => {
        if (!found.length) return;
        setTracks((prev) => {
          const next = [...prev];
          for (const f of found) {
            const exists = next.some(
              (m) => m.videoId === f.videoId || (f.sourceTrackId && m.sourceTrackId === f.sourceTrackId)
            );
            if (!exists) next.push(f);
          }
          saveCustomTracks(next);
          return next;
        });
        pushToast(`Autoplay: +${found.length} track${found.length === 1 ? "" : "s"} — continuing`);
        window.setTimeout(() => {
          if (playerRef.current && !playerRef.current.playing) playerRef.current.next();
        }, 150);
      })
      .catch(() => {
        /* discovery offline — stay stopped; user can press play or Find Similar */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.playing, player.autoStopped, player.index, player.shuffleMode, tracks.length, similarBusy, isOnline]);

  /* ---------------- native Android audio bridge ---------------- */
  useNativeAudioBridge(
    track,
    player.playing,
    () => player.toggle(),
    () => player.toggle(),
    () => player.next(),
    () => player.prev(),
  );

  useEffect(() => {
    setMemoryGovernorPlayerActive(player.playing);
  }, [player.playing]);

  /* Phase 11 — persist playback controls on every change.
   * Volume / mute / rate / shuffle / repeat / current trackId are saved so a
   * refresh restores the exact listening settings (usePlayer re-hydrates them). */
  useEffect(() => {
    persistence.setPlayback({
      trackId: tracksRef.current[playerRef.current?.index ?? 0]?.videoId ?? null,
      volume: player.volume,
      muted: player.muted,
      rate: player.rate,
      shuffleMode: player.shuffleMode,
      repeatMode: player.repeat,
    });
  }, [player.volume, player.muted, player.rate, player.shuffleMode, player.repeat]);

  // Restore last played session on mount — exact queue order, current index,
  // and position (settings were already re-hydrated inside usePlayer).
  const restoredRef = useRef(false);
  const sessionPendingRef = useRef<{
    index: number;
    position: number;
    playing: boolean;
    savedId: string | null;
    committedQueue: Track[] | null;
    cued: boolean;
  } | null>(null);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const lp = persistence.getLastPlayed();
    if (!lp) return;

    // Reconstruct the exact session queue (full Track objects) from every
    // known source, ordered by the saved queueVideoIds.
    const saved = lp.queueVideoIds || [];
    let reordered: Track[] = [];
    if (saved.length) {
      const known = new Map<string, Track>();
      const indexTrack = (t: Track) => {
        const k = t.videoId || t.id;
        if (k && !known.has(k)) known.set(k, t);
      };
      persistence.getPlaylists().forEach((pl) => (pl.tracks || []).forEach(indexTrack));
      loadCustomTracks().forEach(indexTrack);
      TRACKS.forEach(indexTrack);
      const seen = new Set<string>();
      for (const id of saved) {
        if (!id || seen.has(id)) continue;
        const t = known.get(id);
        if (t) {
          seen.add(id);
          reordered.push(t);
        }
      }
    }

    if (reordered.length) {
      const kept = tracksRef.current.filter((t) => !reordered.some((r) => (r.videoId || r.id) === (t.videoId || t.id)));
      const committedQueue = [...reordered, ...kept];
      setTracks(committedQueue);
      const idx = reordered.findIndex((t) => (t.videoId || t.id) === lp.trackVideoId);
      // Cue is deferred to the effect below, which fires only once this exact
      // array commits (reference-identity check) — previously a setTimeout(0)
      // could index the *un-reordered* boot queue and silently cue a DIFFERENT
      // track than the one shown in the header after refresh.
      sessionPendingRef.current = {
        index: idx >= 0 ? idx : 0,
        position: lp.position,
        playing: lp.playing || false,
        savedId: idx >= 0 ? lp.trackVideoId : null,
        committedQueue,
        cued: false,
      };
      return;
    }

    // Fallback: current queue, locate by track id.
    const idx = tracksRef.current.findIndex((t) => (t.videoId || t.id) === lp.trackVideoId);
    if (idx === -1) return;
    sessionPendingRef.current = {
      index: idx,
      position: lp.position,
      playing: lp.playing || false,
      savedId: lp.trackVideoId,
      committedQueue: tracksRef.current,
      cued: false,
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save last played track + position periodically
  useEffect(() => {
    if (!player.playing) return;
    const id = window.setInterval(() => {
      const t = tracksRef.current[playerRef.current?.index ?? 0];
      if (!t) return;
      const pos = playerRef.current?.time ?? 0;
      const queueIds = tracksRef.current.map((x) => x.videoId || x.id);
      persistence.saveLastPlayed(t.videoId || t.id, pos, queueIds, true);
    }, 10000); // save every 10 seconds
    return () => window.clearInterval(id);
  }, [player.playing]);

  // Save on track change or pause
  useEffect(() => {
    const t = tracks[player.index];
    if (!t) return;
    const pos = player.time ?? 0;
    const queueIds = tracks.map((x) => x.videoId || x.id);
    persistence.saveLastPlayed(t.videoId || t.id, pos, queueIds, player.playing);
  }, [player.index, player.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cue the restored track exactly once, and only once the rebuilt queue is
  // actually committed (reference identity) — the cued video always matches
  // the track the UI shows, because both resolve against the same array.
  useEffect(() => {
    const pending = sessionPendingRef.current;
    if (!pending || pending.cued) return;
    if (tracksRef.current !== pending.committedQueue) return;
    if (pending.savedId) {
      const i = tracksRef.current.findIndex((t) => (t.videoId || t.id) === pending.savedId);
      if (i === -1) return;
      pending.index = i;
    }
    if (tracksRef.current.length <= pending.index) return;
    pending.cued = true;
    const p = playerRef.current;
    if (!p) return;
    p.cue(pending.index, pending.playing); // best-effort resume; autoplay
    // blocked by the browser is absorbed by onStateChange (safe fallback).
  }, [tracks]);

  // Apply a deferred seek once the restored (or user-selected) track is
  // actually cued and mounted — anchor `/cue` parks it in pendingRef until
  // onReady, so a raw seek right after cue could target a stale video.
  useEffect(() => {
    const pending = sessionPendingRef.current;
    if (!pending || !pending.cued || !player.ready) return;
    if (player.index !== pending.index) return;
    sessionPendingRef.current = null;
    player.seek(pending.position);
    // Heal: the index-change save fires with position 0 right after cue — write
    // the real restored position back so the next refresh keeps the playhead.
    const healed = tracksRef.current[pending.index];
    if (healed) {
      persistence.saveLastPlayed(healed.videoId || healed.id, pending.position, tracksRef.current.map((x) => x.videoId || x.id), pending.playing);
    }
  }, [player.ready, player.index, player]);

  // Save on page unload
  useEffect(() => {
    const handler = () => {
      const t = tracksRef.current[playerRef.current?.index ?? 0];
      if (!t) return;
      const pos = playerRef.current?.time ?? 0;
      const queueIds = tracksRef.current.map((x) => x.videoId);
      persistence.saveLastPlayed(t.videoId, pos, queueIds, !!playerRef.current?.playing);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  /* ---------------- Room Mode (Supabase Realtime) ---------------- */
  const [roomOpen, setRoomOpen] = useState(false); // mobile overlay (join flows from search/history)
  const [searchOpen, setSearchOpen] = useState(false); // mobile overlay search
  const [historyOpen, setHistoryOpen] = useState(false); // mobile overlay history
  const [roomTarget, setRoomTarget] = useState<PlaybackState | null>(null);

  const getPlayback = useCallback(() => {
    const t = tracksRef.current[playerRef.current?.index ?? 0];
    if (!t) return null;
    return {
      videoId: t.videoId,
      title: t.title,
      artist: t.artist,
      thumb: t.thumb || "",
      isPlaying: !!playerRef.current?.playing,
      position: playerRef.current?.time ?? 0,
    };
  }, []);

  const applyPlayback = useCallback((pb: PlaybackState) => {
    // If remote has no valid song, NEVER pause or interfere with local music!
    if (!pb || !pb.videoId || !pb.videoId.trim()) return;
    setTracks((prev) => {
      if (prev.some((t) => t.videoId === pb.videoId)) return prev;
      const t = makeTrack(pb.videoId, pb.title || "Room track", pb.artist || "Host", "Room · shared", "similar");
      return [...prev, { ...t, thumb: pb.thumb || t.thumb }];
    });
    setRoomTarget(pb);
  }, []);

  const getQueue = useCallback(() => tracksRef.current, []);
  const applyQueue = useCallback((q: Track[]) => {
    if (!Array.isArray(q) || q.length === 0) return;
    setTracks(q);
    saveCustomTracks(q);
  }, []);

  const room = useRoom({ getPlayback, applyPlayback, getQueue, applyQueue, onToast: pushToast });
  const roomRef = useRef(room);
  roomRef.current = room;

  /* Room join history — recorded the moment we're actually in a room */
  useEffect(() => {
    const info = room.room;
    if (!room.inRoom || !info?.code) return;
    try {
      persistence.addRoomToHistory({
        roomId: info.code,
        roomCode: info.code,
        name: info.name || `${info.code} Room`,
        isHost: !!room.isHost,
      });
    } catch {
      /* history is best-effort; never block room sync */
    }
  }, [room.inRoom, room.isHost, room.room]);

  const handleReorder = useCallback((from: number, to: number) => {
    setTracks((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      saveCustomTracks(next);
      playerRef.current?.afterReorder(from, to, next);
      if (roomRef.current?.inRoom && roomRef.current.isHost) {
        roomRef.current.broadcastQueue(next);
      }
      return next;
    });
  }, []);

  const isRemoteUpdate = useRef(false);

  // Auto-pause when kicked/closed from room
  useEffect(() => {
    if (room.status === "closed" || room.status === "denied") {
      if (playerRef.current?.playing) {
        isRemoteUpdate.current = true;
        playerRef.current.toggle();
        const t = window.setTimeout(() => { isRemoteUpdate.current = false; }, 300);
        return () => window.clearTimeout(t);
      }
    }
  }, [room.status]);

  // Drift-corrected playback follower (works for host AND members)
  // When the host receives a broadcast from a permitted member, this applies
  // it to the host's player so the host relays the correct state via heartbeat.
  useEffect(() => {
    if (!roomTarget || !roomTarget.videoId) return;
    const list = tracksRef.current;
    const idx = list.findIndex((t) => t.videoId === roomTarget.videoId);
    if (idx === -1) return;
    const p = playerRef.current;
    if (!p) return;
    const expected = roomTarget.position + (roomTarget.isPlaying ? (Date.now() - roomTarget.ts) / 1000 : 0);
    const isHostRelay = room.isOwner;
    if (idx !== p.index) {
      if (roomTarget.isPlaying) {
        isRemoteUpdate.current = true;
        p.cue(idx, true);
        window.setTimeout(() => {
          playerRef.current?.seek(Math.max(0, expected));
          isRemoteUpdate.current = false;
          if (isHostRelay) room.pushPlayback();
        }, 550);
      }
    } else {
      if (Math.abs(p.time - expected) > 1.5) p.seek(Math.max(0, expected));
      // ONLY sync play if remote is explicitly playing.
      // Never auto-pause user's existing music when joining a room.
      if (roomTarget.isPlaying && !p.playing) {
        isRemoteUpdate.current = true;
        p.toggle();
        window.setTimeout(() => {
          isRemoteUpdate.current = false;
          if (isHostRelay) room.pushPlayback();
        }, 300);
      }
    }
  }, [roomTarget, tracks, room.isOwner]);

  // Playback broadcast: Only broadcast when the local user MANUALLY changes track or toggles play/pause.
  // Never broadcast just because permissions or roles changed (which previously caused song 0 reset)!
  const prevIndexRef = useRef(player.index);
  const prevPlayingRef = useRef(player.playing);
  const wasInRoomRef = useRef(room.inRoom);

  useEffect(() => {
    if (!room.inRoom) {
      wasInRoomRef.current = false;
      prevIndexRef.current = player.index;
      prevPlayingRef.current = player.playing;
      return;
    }

    if (!wasInRoomRef.current) {
      wasInRoomRef.current = true;
      prevIndexRef.current = player.index;
      prevPlayingRef.current = player.playing;
      // Only the room creator (owner) broadcasts initial room playback on creation
      if (room.isOwner) {
        room.pushPlayback();
      }
      return;
    }

    // Ignore remote updates from other room peers
    if (isRemoteUpdate.current) {
      prevIndexRef.current = player.index;
      prevPlayingRef.current = player.playing;
      return;
    }

    const indexChanged = player.index !== prevIndexRef.current;
    const playingChanged = player.playing !== prevPlayingRef.current;

    prevIndexRef.current = player.index;
    prevPlayingRef.current = player.playing;

    // Only broadcast if the local user actually clicked play/pause or changed track
    if (indexChanged || playingChanged) {
      if (room.canDrive) {
        room.pushPlayback();
      }
    }
  }, [player.index, player.playing, room.inRoom, room.canDrive, room.isOwner]);

  const handleSeek = useCallback((pos: number) => {
    void pos;
    if (room.inRoom && room.canDrive) {
      window.setTimeout(() => {
        room.pushPlayback();
      }, 50);
    }
  }, [room.inRoom, room.canDrive, room.pushPlayback]);

  const controlsLocked = room.inRoom && !room.canDrive;
  // Host should never have their own controls restricted by room permissions
  const effectiveRoomPerms = room.inRoom && !room.isHost ? room.permissions : undefined;

  // Magic shuffle auto-seed
  const magicSeeded = useRef(false);
  useEffect(() => {
    if (player.shuffleMode === "magic") {
      if (!magicSeeded.current) {
        magicSeeded.current = true;
        topUpSimilar(false);
      }
    } else {
      magicSeeded.current = false;
    }
  }, [player.shuffleMode, topUpSimilar]);

  /* ---------------- presence ---------------- */
  const { online, mode } = usePresence();

  /* ---------------- settings & view mode ---------------- */
  const { settings, update, glassVars, reset, maxUpload } = useSettings(theme, applyTheme);

  /* Live background wallpaper — the current track's video as a muted <video> */
  useLiveBgVideo(settings.bgStyle, track, player.playing);

  /* ---------------- beat driver (visual sync; user calibration from settings) ---------------- */
  useBeatDriver(player.playing, track?.bpm ?? 96, track?.seed ?? 1, player.time, settings.beatTempo, settings.beatPhase);

  const [mobileTab, setMobileTab] = useState<MobileTab>("queue");
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("ripple-view") as ViewMode) || "full");

  const changeView = useCallback((v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem("ripple-view", v);
    } catch {
      /* noop */
    }
  }, []);

  /* ---------------- Desktop screen system (screen-by-screen, no sidebars) ---------------- */
  const [screen, setScreen] = useState<ScreenId>(() => {
    const saved = persistence.getPreferences().activeScreen as string;
    const valid = ["player", "library", "rooms", "history", "settings", "search"];
    return (valid.includes(saved) ? saved : "player") as ScreenId;
  });

  const changeScreen = useCallback(
    (s: ScreenId) => {
      setScreen(s);
      setSearchOpen(false);
      persistence.setPreferences({ activeScreen: s });
      if (s !== "player" && view === "time") changeView("full");
    },
    [view, changeView]
  );

  // Invite link & refresh: useRoom auto-joins or restores the room — land on the FULL Rooms screen
  useEffect(() => {
    const invite = readInviteCode();
    if (invite) {
      setRoomOpen(false);
      changeScreen("rooms");
      requestMobileTab("room");
    } else if (screen === "rooms") {
      requestMobileTab("room");
    }
  }, [screen, changeScreen]);

  /* Shared play/queue handlers for screen-level UI (search, library, history) */
  const uiPlayTrack = (t: Track, opts?: { goHome?: boolean }) => {
    setTracks((prev) => {
      const k = queueKey(t);
      const idx = prev.findIndex((x) => queueKey(x) === k);
      if (idx !== -1) {
        player.select(idx);
        return prev;
      }
      const next = [...prev, t];
      saveCustomTracks(next);
      window.setTimeout(() => player.select(next.length - 1), 60);
      return next;
    });
    if (opts?.goHome) changeScreen("player");
    pushToast(`Playing — ${t.title}`);
  };

  const uiAddToQueue = (t: Track) => {
    setTracks((prev) => {
      const k = queueKey(t);
      if (prev.some((x) => queueKey(x) === k)) return prev;
      const next = [...prev, t];
      saveCustomTracks(next);
      return next;
    });
    pushToast(`Added — ${t.title}`);
  };

  const uiPlayList = (list: Track[]) => {
    if (!list.length) return;
    player.loadAndPlay(list, 0);
    setTracks(list);
    saveCustomTracks(list);
    changeScreen("player");
    pushToast(`Playing (${list.length} tracks)`);
  };

  const uiQueueList = (list: Track[]) => {
    if (!list.length) return;
    setTracks((prev) => {
      const existing = new Set(prev.map(queueKey));
      const added = list.filter((x) => !existing.has(queueKey(x)));
      const next = [...prev, ...added];
      saveCustomTracks(next);
      return next;
    });
    pushToast(`Queued ${list.length} tracks`);
  };

  const uiJoinRoom = (code: string, target: "screen" | "overlay") => {
    // All join flows land on the full Rooms screen — never the side panel.
    changeScreen("rooms");
    if (target === "overlay") requestMobileTab("room");
    if (!room.nickname || !room.nickname.trim()) {
      pushToast(`Set your name in the Rooms screen first, then join #${code}`);
      return;
    }
    room.joinRoom(code, room.nickname, false);
  };

  /* ---------------- background media library (IndexedDB cache) ---------------- */
  const [library, setLibrary] = useState<BgLibrary>(() => getLibrary());
  const [bgSrc, setBgSrc] = useState("");
  const [bgItem, setBgItem] = useState<BgItem | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const urlRef = useRef<string>("");

  const applyBlobUrl = useCallback((url: string, item: BgItem | null) => {
    if (urlRef.current && urlRef.current !== url) {
      untrackBlobUrl(urlRef.current);
    }
    urlRef.current = url;
    if (url) trackBlobUrl(url);
    setBgSrc(url);
    setBgItem(item);
  }, []);

  // Restore active wallpaper from cache on mount
  useEffect(() => {
    let dead = false;
    openActiveBg().then((r) => {
      if (dead) return;
      if (r) {
        applyBlobUrl(r.url, r.item);
        update("bgKind", "library");
      } else {
        const lib = getLibrary();
        if (lib.items.length) setLibrary(lib);
      }
    });
    return () => {
      dead = true;
    };
  }, [applyBlobUrl, update]);

  useEffect(
    () => () => {
      if (urlRef.current) untrackBlobUrl(urlRef.current);
    },
    []
  );

  const onFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith("image") && !f.type.startsWith("video")) {
        pushToast("Please choose an image or video file");
        return;
      }
      if (f.size > maxUpload) {
        pushToast(`File too large — max ${Math.round(maxUpload / 1048576)} MB`);
        return;
      }
      setUploadBusy(true);
      addBgMedia(f, f.name)
        .then(({ item, library: lib }) => {
          setLibrary(lib);
          applyBlobUrl(URL.createObjectURL(f), item);
          update("bgKind", "library");
          update("bgStyle", "media");
          pushToast(`Saved · ${item.name.slice(0, 20)} · stored locally`);
        })
        .catch(() => pushToast("Couldn't store that media file"))
        .finally(() => setUploadBusy(false));
    },
    [applyBlobUrl, maxUpload, pushToast, update]
  );

  const useItem = useCallback(
    (id: string) => {
      const lib = setActiveBg(id);
      setLibrary(lib);
      openBgItem(id).then((r) => {
        if (r) {
          applyBlobUrl(r.url, r.item);
          update("bgKind", "library");
          update("bgStyle", "media");
          pushToast(`Wallpaper — ${r.item.name.slice(0, 20)}`);
        } else pushToast("That clip is no longer cached");
      });
    },
    [applyBlobUrl, pushToast, update]
  );

  const removeItem = useCallback(
    (id: string) => {
      deleteBgItem(id).then((lib) => {
        setLibrary(lib);
        pushToast("Removed from history");
        if (lib.active) {
          openBgItem(lib.active).then((r) => r && applyBlobUrl(r.url, r.item));
        } else {
          applyBlobUrl("", null);
          update("bgKind", "none");
        }
      });
    },
    [applyBlobUrl, pushToast, update]
  );

  const onClearMedia = useCallback(() => {
    clearBgMedia().then((lib) => {
      setLibrary(lib);
      applyBlobUrl("", null);
      update("bgKind", "none");
      pushToast("Background history cleared");
    });
  }, [applyBlobUrl, pushToast, update]);

  /* ---------------- live weather (Open-Meteo) ---------------- */
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [wLoading, setWLoading] = useState(true);
  const [pinned, setPinned] = useState<Place | null>(() => getPinnedPlace());

  const loadWeather = useCallback(async (relocate = false) => {
    if (!navigator.onLine) return;
    setWLoading(true);
    try {
      setWeather(await fetchWeather(relocate));
    } catch {
      /* retain previous weather data */
    } finally {
      setWLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeather();
    const live = window.setInterval(() => loadWeather(false), 90_000);
    const reloc = window.setInterval(() => loadWeather(true), 30 * 60_000);
    const onVis = () => document.visibilityState === "visible" && loadWeather(false);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(live);
      window.clearInterval(reloc);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadWeather, pinned]);

  /* ---------------- favorites / likes ---------------- */
  const [liked, setLiked] = useState<Set<string>>(() => new Set(persistence.getStore().likedTrackIds));
  const toggleLike = useCallback(() => {
    if (!track) return;
    const isLiked = persistence.toggleLike(track.id, track);
    setLiked((prev) => {
      const n = new Set(prev);
      if (isLiked) {
        n.add(track.id);
        pushToast("Saved to favorites");
      } else {
        n.delete(track.id);
      }
      return n;
    });
  }, [track, pushToast]);

  /** Toggle like for any arbitrary track — used by mobile playlist screen */
  const toggleLikeTrack = useCallback((t: import("./lib/trackModel").Track) => {
    const isLiked = persistence.toggleLike(t.id, t);
    setLiked((prev) => {
      const n = new Set(prev);
      if (isLiked) { n.add(t.id); } else { n.delete(t.id); }
      return n;
    });
  }, []);

  const exportSettings = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            settings,
            queue: tracks.map(({ videoId, title, artist, thumb }) => ({ videoId, title, artist, thumb })),
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ripple-setup.json";
    a.click();
    URL.revokeObjectURL(a.href);
    pushToast("Setup exported");
  }, [settings, tracks, pushToast]);

  useEffect(() => {
    document.body.style.background = theme.bg0;
  }, [theme]);

  /* ---------------- keyboard shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;

      // Hardware media/multimedia keys (laptop Fn-keys, keyboards, media buttons).
      // These fire as normal keydown events and must work even while typing, and
      // even when the platform routes the media key to the YouTube iframe session.
      const media =
        e.key === "MediaPlayPause" || e.code === "MediaPlayPause"
          ? "toggle"
          : e.key === "MediaTrackNext" || e.code === "MediaTrackNext"
            ? "next"
            : e.key === "MediaTrackPrevious" || e.code === "MediaTrackPrevious"
              ? "prev"
              : e.key === "MediaStop" || e.code === "MediaStop"
                ? "stop"
                : null;
      if (media) {
        e.preventDefault();
        const p = playerRef.current;
        if (!p) return;
        if (media === "toggle") p.toggle();
        else if (media === "next") p.next();
        else if (media === "prev") p.prev();
        else p.toggle();
        return;
      }

      if (e.key === "Escape") {
        setSearchOpen(false);
        setHistoryOpen(false);
        setRoomOpen(false);
        if (view === "time") changeView("full");
        else changeScreen("player");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (window.matchMedia("(min-width: 768px)").matches) {
          changeScreen(screen === "search" ? "player" : "search");
        } else {
          setSearchOpen((v) => !v);
        }
        return;
      }
      if (typing) return;
      const p = playerRef.current;
      if (!p) return;
      switch (e.key) {
        case " ":
          if (tag === "BUTTON") return;
          e.preventDefault();
          p.toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (p.duration) p.seek(Math.min(p.duration, p.time + 5));
          break;
        case "ArrowLeft":
          e.preventDefault();
          p.seek(Math.max(0, p.time - 5));
          break;
        case "ArrowUp":
          e.preventDefault();
          p.setVol(p.volume + 5);
          break;
        case "ArrowDown":
          e.preventDefault();
          p.setVol(p.volume - 5);
          break;
        case "m":
        case "M":
          p.toggleMute();
          break;
        case "s":
        case "S":
          p.cycleShuffle();
          break;
        case "r":
        case "R":
          p.cycleRepeat();
          break;
        case "f":
        case "F":
          topUpSimilar(true);
          break;
        case "t":
        case "T": {
          const nx = THEMES[(THEMES.findIndex((x) => x.id === themeId) + 1) % THEMES.length];
          applyTheme(nx.id);
          update("themeId", nx.id);
          update("customAccent", null);
          pushToast(`Theme — ${nx.name}`);
          break;
        }
        case "c":
        case "C":
          changeView(view === "time" ? "full" : "time");
          break;
        case "e":
        case "E":
          if (window.matchMedia("(min-width: 768px)").matches) {
            changeScreen(screen === "settings" ? "player" : "settings");
          } else {
            requestMobileTab("customization");
          }
          break;
        case "v":
        case "V": {
          const order: ViewMode[] = ["full", "time"];
          const nx = order[(order.indexOf(view) + 1) % order.length];
          changeView(nx);
          pushToast(`View — ${nx === "full" ? "split layout" : "full clock"}`);
          break;
        }
        case "b":
        case "B": {
          const ids = library.items.map((i) => i.id);
          if (!ids.length) {
            pushToast("No saved wallpapers yet");
            return;
          }
          const at = ids.indexOf(library.active ?? "");
          const nxt = ids[(at + 1) % ids.length];
          useItem(nxt);
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyTheme, themeId, pushToast, topUpSimilar, library, useItem, view, changeView, screen, changeScreen]);

  const effectiveTheme = useMemo(() => {
    if (!settings.customAccent) return theme;
    const derived = deriveAccents(settings.customAccent);
    return {
      ...theme,
      acc0: derived.acc0,
      acc1: derived.acc1,
      acc2: derived.acc2,
      orbs: derived.orbs,
    };
  }, [theme, settings.customAccent]);

  const vars = useMemo(
    () =>
      ({
        "--bg0": effectiveTheme.bg0,
        "--bg1": effectiveTheme.bg1,
        "--ink": effectiveTheme.ink,
        "--dim": effectiveTheme.dim,
        "--acc0": effectiveTheme.acc0,
        "--acc1": effectiveTheme.acc1,
        "--acc2": effectiveTheme.acc2,
        ...glassVars,
      }) as React.CSSProperties,
    [effectiveTheme, glassVars]
  );

  const fallbackPresetUrl = "https://images.unsplash.com/photo-1499346030926-9a72daac6c63?auto=format&fit=crop&w=1200&q=60";
  const rawMediaSrc = settings.bgKind === "library" ? bgSrc : settings.bgUrl;
  const mediaSrc = rawMediaSrc || (settings.bgStyle === "media" && settings.bgKind === "none" ? fallbackPresetUrl : "");
  const mediaMime = settings.bgKind === "library" ? bgItem?.mime ?? "" : "";

  return (
    <div
      style={{ ...vars, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      className="relative flex h-[100dvh] flex-col overflow-hidden font-body text-[var(--ink)]"
    >
      {/* Background Media & Visual Layers */}
      <MediaLayer settings={settings} theme={effectiveTheme} src={mediaSrc} mime={mediaMime} currentTrack={track} />
      <BackgroundCanvas
        theme={effectiveTheme}
        style={settings.bgStyle}
        fx={settings.fxIntensity}
        fxType={settings.fxType}
        fxSpeed={settings.fxSpeed}
        fxAudioReactive={settings.fxAudioReactive}
        fxOnMedia={settings.fxOnMedia}
        playing={player.playing}
      />
      {settings.clickFx && <RippleLayer theme={effectiveTheme} />}

      {/* ---------------- Desktop Layout: preserved 100% untouched for >= 768px ---------------- */}
      <div className="relative z-10 hidden md:flex h-full min-h-0 flex-col">
        {/* Top Navigation Bar */}
        <TopBar
          online={online}
          mode={mode}
          view={view}
          onView={(v) => {
            changeView(v);
            // Split view IS the home screen — returning to it lands back on the player
            if (v === "full") changeScreen("player");
          }}
          screen={screen}
          onScreen={changeScreen}
          roomActive={room.inRoom}
          roomCount={room.online}
        />

        {/* View 1: Full Clock Window with Full Weather View (Screenshot 3) */}
        {view === "time" ? (
          <main className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 overflow-hidden px-3 py-1 md:px-6 md:py-2">
            <TimeScreen
              weather={weather}
              unit={settings.unit}
              clock24={settings.clock24}
              showSeconds={settings.showSeconds}
              player={player}
              track={track}
            />
          </main>
        ) : screen !== "player" ? (
          /* Full screens — screen-by-screen layout, no sidebars (split/clock view still global) */
          <main className="scroll-slim mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-3 py-1 md:px-6 md:py-2">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              {screen === "settings" && (
                <ErrorBoundary key="sec-settings" label="Settings">
                  <CustomizePanel
                    inline
                    open={screen === "settings"}
                    onClose={() => changeScreen("player")}
                    theme={effectiveTheme}
                    settings={settings}
                    update={update}
                    reset={reset}
                    onFile={onFile}
                    onExport={exportSettings}
                    library={library}
                    maxUpload={maxUpload}
                    busy={uploadBusy}
                    onUseItem={useItem}
                    onDeleteItem={removeItem}
                    onClearMedia={onClearMedia}
                    pinned={pinned}
                    onPin={(p) => {
                      setPinned(p);
                      pinPlace(p);
                      loadWeather(false);
                      pushToast(p ? `Pinned ${p.name}` : "Weather reset to auto-detect");
                    }}
                  />
                </ErrorBoundary>
              )}
              {screen === "rooms" && (
                <ErrorBoundary key="sec-rooms" label="Rooms">
                  <RoomPanel inline open={screen === "rooms"} onClose={() => changeScreen("player")} room={room} onToast={pushToast} />
                </ErrorBoundary>
              )}
              {screen === "search" && (
                <ErrorBoundary key="sec-search" label="Search">
                  <SearchModal
                    inline
                    open={screen === "search"}
                    onClose={() => changeScreen("player")}
                    onPlayTrack={(t) => uiPlayTrack(t, { goHome: true })}
                    onAddToQueue={uiAddToQueue}
                    onOpenPlaylist={(pl) => {
                      changeScreen("library");
                      requestOpenPlaylist(pl.id);
                    }}
                    onJoinRoom={(code) => uiJoinRoom(code, "screen")}
                    onToast={pushToast}
                    onPlayList={uiPlayList}
                    onAddListToQueue={uiQueueList}
                    queueTracks={tracks}
                  />
                </ErrorBoundary>
              )}
              {screen === "history" && (
                <ErrorBoundary key="sec-history" label="History">
                  <div className="screen-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10">
                    <HistoryView
                      onPlayTrack={(t) => uiPlayTrack(t, { goHome: true })}
                      onAddToQueue={uiAddToQueue}
                      onJoinRoom={(code) => uiJoinRoom(code, "screen")}
                      onToast={pushToast}
                      currentVideoId={track?.videoId}
                    />
                  </div>
                </ErrorBoundary>
              )}
              {screen === "library" && (
                <ErrorBoundary key="sec-library" label="Library">
                  <LibraryScreen
                    onPlayTrack={(t) => uiPlayTrack(t)}
                    onAddToQueue={uiAddToQueue}
                    onPlayEntirePlaylist={uiPlayList}
                    onAddPlaylistToQueue={uiQueueList}
                    onToast={pushToast}
                  />
                </ErrorBoundary>
              )}
            </div>
          </main>
        ) : (
          /* View 2: Split Layout */
          <main
            className="scroll-slim mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-3 py-1 md:px-6 md:py-2 lg:grid lg:grid-cols-[1.06fr_0.94fr] lg:gap-6 lg:overflow-hidden"
          >
            {/* Mobile Navigation Segment Control (only visible on mobile screens < lg) */}
            <div className="mb-2 flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-s)] border border-white/8 bg-black/20 p-1 lg:hidden">
              <button
                onClick={() => setMobileTab("queue")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 font-tmono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                  mobileTab === "queue" ? "bg-[var(--acc0)] font-bold text-black shadow-sm" : "text-[var(--dim)] hover:text-white"
                )}
              >
                <ListMusicIcon size={13} /> Queue ({tracks.length})
              </button>
              <button
                onClick={() => setMobileTab("clock")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 font-tmono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                  mobileTab === "clock" ? "bg-[var(--acc0)] font-bold text-black shadow-sm" : "text-[var(--dim)] hover:text-white"
                )}
              >
                <ClockOnlyIcon size={13} /> Clock
              </button>
            </div>

            {/* Left Stage: Vinyl Disc + Glowing Ring + Player Console */}
            <section
              className={cn(
                "min-h-0 flex-col justify-start gap-3 pt-1 lg:flex lg:shrink lg:justify-center lg:gap-4 lg:pt-0",
                mobileTab === "queue" ? "flex flex-1" : "hidden"
              )}
            >
              <DiscStage
                track={track}
                playing={player.playing}
                buffering={player.buffering}
                ready={player.ready}
                time={player.time}
                duration={player.duration}
                buffered={player.buffered}
                liked={liked.has(track?.id ?? "")}
                onLike={toggleLike}
                theme={effectiveTheme}
              />
              <Controls
                player={player}
                locked={controlsLocked}
                inRoom={room.inRoom}
                roomPerms={effectiveRoomPerms}
                hideTime={false}
                onSeek={handleSeek}
              />
            </section>

            {/* Right Aside: Clock Weather + Queue */}
            <aside
              className={cn(
                "scroll-slim min-h-0 flex-1 flex-col gap-3 pb-2 lg:flex lg:gap-3 lg:overflow-hidden lg:pb-0 lg:pr-1",
                mobileTab === "queue" || mobileTab === "clock"
                  ? "flex"
                  : "hidden lg:flex"
              )}
            >
              {/* Clock Card with Open Full Clock View Button */}
              <div className={cn("shrink-0", mobileTab === "queue" ? "hidden lg:block" : "block")}>
                <ClockCard
                  weather={weather}
                  loading={wLoading}
                  unit={settings.unit}
                  clock24={settings.clock24}
                  showSeconds={settings.showSeconds}
                  onRefresh={() => loadWeather(false)}
                  onExpand={() => changeView("time")}
                />
              </div>

              {/* Queue with Direct Link Importer, Reordering, and Full Vertical Expansion */}
              <div className={cn("min-h-0 flex-1 flex-col", mobileTab === "clock" ? "hidden lg:flex" : "flex")}>
                <Playlist
                  tracks={tracks}
                  player={player}
                  onAdd={addTrack}
                  onRemove={removeTrack}
                  onReorder={handleReorder}
                  busy={addBusy}
                  error={addError}
                  onFindSimilar={() => topUpSimilar(true)}
                  similarBusy={similarBusy}
                  similarLive={similarLive}
                  onAddTrack={uiAddToQueue}
                  onPlayTrack={(t) => uiPlayTrack(t)}
                  onClearQueue={clearQueue}
                />
              </div>
            </aside>
          </main>
        )}

        {/* Quick Wallpaper Switcher Badges (Bottom Left) */}
        {settings.bgStyle === "media" && library.items.length > 1 && (
          <div className="pointer-events-auto absolute bottom-3 left-3 z-20 hidden items-center gap-1.5 rounded-full px-2 py-1.5 md:flex glass">
            <span className="px-1 font-tmono text-[8px] uppercase tracking-[0.16em] text-[var(--dim)]">wallpaper</span>
            {library.items.slice(0, 6).map((it) => (
              <button
                key={it.id}
                onClick={() => useItem(it.id)}
                title={it.name}
                className={cn(
                  "grid h-7 w-9 place-items-center overflow-hidden rounded-md border text-[7px] uppercase tracking-[0.1em]",
                  library.active === it.id && settings.bgKind === "library"
                    ? "border-[var(--acc0)] text-[var(--acc0)]"
                    : "border-white/15 text-[var(--dim)] hover:border-white/40"
                )}
              >
                {it.kind === "video" ? "VID" : "IMG"}
              </button>
            ))}
          </div>
        )}

        {/* Bottom Bar: Keyboard Hints & Credits */}
        <footer className="pointer-events-none relative z-10 hidden items-center justify-between px-6 pb-2 text-[8px] uppercase tracking-[0.24em] text-[var(--dim)]/70 md:flex">
          <div className="flex items-center gap-3">
            <span><kbd className="rounded bg-white/8 px-1 py-0.5 text-white/90">Space</kbd> play</span>
            <span><kbd className="rounded bg-white/8 px-1 py-0.5 text-white/90">S</kbd> shuffle</span>
            <span><kbd className="rounded bg-white/8 px-1 py-0.5 text-white/90">V</kbd> view</span>
            <span><kbd className="rounded bg-white/8 px-1 py-0.5 text-white/90">E</kbd> settings</span>
          </div>
          <div className="flex items-center gap-2">
            <span>YOUTUBE</span>
            <span>·</span>
            <span>OPEN-METEO</span>
            <span>·</span>
            <span>CREESPY</span>
          </div>
        </footer>
      </div>

      {/* ---------------- Mobile Layout: dedicated native experience for < 768px ---------------- */}
      <div className="relative z-10 flex md:hidden h-full min-h-0 flex-col">
        <MobileShell
          track={track}
          tracks={tracks}
          player={player}
          liked={liked}
          onLike={toggleLike}
          onLikeTrack={toggleLikeTrack}
          theme={effectiveTheme}
          settings={settings}
          update={update}
          reset={reset}
          onTheme={(id) => {
            applyTheme(id);
            update("themeId", id);
            update("customAccent", null);
          }}
          room={room}
          weather={weather}
          wLoading={wLoading}
          onRefreshWeather={() => loadWeather(false)}
          onAddTrack={addTrack}
                   onPlayEntirePlaylist={(list) => {
                     if (!list.length) return;
                     player.loadAndPlay(list, 0);
                     setTracks(list);
                     saveCustomTracks(list);
                     pushToast(`Playing playlist (${list.length} tracks)`);
                   }}
onAddPlaylistToQueue={(list) => {
                       if (!list.length) return;
                       setTracks((prev) => {
                         const existing = new Set(prev.map(queueKey));
                         const added = list.filter((x) => !existing.has(queueKey(x)));
                         const next = [...prev, ...added];
                         saveCustomTracks(next);
                         return next;
                       });
             pushToast(`Added ${list.length} tracks to queue`);
           }}
          onRemoveTrack={removeTrack}
          onReorderTrack={handleReorder}
          onFindSimilar={() => topUpSimilar(true)}
          similarBusy={similarBusy}
          onClearQueue={clearQueue}
          onFile={onFile}
          uploadBusy={uploadBusy}
          maxUpload={maxUpload}
          onToast={pushToast}
          library={library}
          onUseItem={useItem}
          onDeleteItem={removeItem}
          onClearMedia={onClearMedia}
          onSeek={handleSeek}
          onSearch={() => setSearchOpen(true)}
          onHistory={() => setHistoryOpen(true)}
        />
      </div>

      {/* ---------------- Room Panel (mobile overlay: join flows from search/history) ---------------- */}
      <RoomPanel
        open={roomOpen}
        onClose={() => setRoomOpen(false)}
        room={room}
        onToast={pushToast}
      />

      {/* ---------------- Global Search Modal (Ctrl/Cmd + K) ---------------- */}
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPlayTrack={(t) => {
          setTracks((prev) => {
            const k = queueKey(t);
            const idx = prev.findIndex((x) => queueKey(x) === k);
            if (idx !== -1) {
              player.select(idx);
              return prev;
            }
            const next = [...prev, t];
            saveCustomTracks(next);
            window.setTimeout(() => player.select(next.length - 1), 60);
            return next;
          });
          setSearchOpen(false);
          pushToast(`Playing — ${t.title}`);
        }}
        onAddToQueue={(t) => {
          setTracks((prev) => {
            const k = queueKey(t);
            if (prev.some((x) => queueKey(x) === k)) return prev;
            const next = [...prev, t];
            saveCustomTracks(next);
            return next;
          });
          pushToast(`Added — ${t.title}`);
        }}
        onOpenPlaylist={(pl) => {
          setSearchOpen(false);
          changeScreen("library");
          requestMobileTab("playlist");
          requestOpenPlaylist(pl.id);
        }}
        onPlayList={uiPlayList}
        onAddListToQueue={uiQueueList}
        onJoinRoom={(code) => {
          setSearchOpen(false);
          setHistoryOpen(false);
          uiJoinRoom(code, "overlay");
        }}
        queueTracks={tracks}
        onToast={pushToast}
      />

      {/* ---------------- Playback & Room History ---------------- */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="fixed inset-2 sm:inset-4 md:inset-8 lg:inset-x-14 lg:inset-y-8 z-[66] max-w-4xl max-h-[86vh] w-full mx-auto my-auto flex flex-col rounded-2xl md:rounded-3xl border overflow-hidden shadow-2xl"
              style={{
                background: `linear-gradient(170deg, color-mix(in srgb, ${effectiveTheme.bg0} 94%, transparent), color-mix(in srgb, ${effectiveTheme.bg1} 96%, #050811))`,
                borderColor: "var(--glass-border)",
                backdropFilter: "blur(28px)",
              }}
            >
              <HistoryView
                onPlayTrack={(t) => {
                  setTracks((prev) => {
                    const k = queueKey(t);
                    const idx = prev.findIndex((x) => queueKey(x) === k);
                    if (idx !== -1) {
                      player.select(idx);
                      return prev;
                    }
                    const next = [...prev, t];
                    saveCustomTracks(next);
                    window.setTimeout(() => player.select(next.length - 1), 60);
                    return next;
                  });
                  setHistoryOpen(false);
                  pushToast(`Playing — ${t.title}`);
                }}
                onAddToQueue={(t) => {
                  setTracks((prev) => {
                    const k = queueKey(t);
                    if (prev.some((x) => queueKey(x) === k)) return prev;
                    const next = [...prev, t];
                    saveCustomTracks(next);
                    return next;
                  });
                  pushToast(`Added — ${t.title}`);
                }}
                onJoinRoom={(code) => {
                  setHistoryOpen(false);
                  uiJoinRoom(code, "overlay");
                }}
                onToast={pushToast}
                currentVideoId={track?.videoId}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---------------- Toasts ---------------- */}
      <Toasts toasts={toasts} />
      {/* ---------------- Background import ---------------- */}
      <BackgroundImportWindow />
    </div>
  );
}
