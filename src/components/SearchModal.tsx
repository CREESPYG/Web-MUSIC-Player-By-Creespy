import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TRACKS } from "../data/tracks";
import { searchYouTubeMixed, loadCustomTracks } from "../lib/media";
import { loadYouTubePlaylist } from "../lib/playlist";
import { persistence, subscribeToPlaylistChanges, type CustomPlaylist } from "../lib/persistence";
import {
  fetchGlobalPublicPlaylists,
  subscribeToPublicPlaylists,
  publishPlaylist,
} from "../lib/publicPlaylists";
import { userId } from "../lib/room";
import type { RemoteSearchItem } from "../lib/streamResolver";
import type { Track } from "../lib/trackModel";
import {
  SearchIcon,
  XIcon,
  PlayIcon,
  PlusIcon,
  DiscIcon,
  RadioTowerIcon,
  FolderMusicIcon,
  GlobeIcon,
  CheckIcon,
} from "./UiIcons";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onOpenPlaylist: (playlist: CustomPlaylist) => void;
  onJoinRoom: (roomCode: string) => void;
  onToast: (msg: string) => void;
  /** Play a whole track list (imported YouTube playlist, etc.). */
  onPlayList?: (tracks: Track[]) => void;
  /** Queue a whole track list (playlists from search). */
  onAddListToQueue?: (tracks: Track[]) => void;
  /** Current queue, so search sees everything the player knows about. */
  queueTracks?: Track[];
  /** Render inline as a screen section instead of a centered overlay. */
  inline?: boolean;
}

const VIDEO_KEY = (t: Track) => t.videoId || t.id;

function plMatches(pl: CustomPlaylist, q: string): boolean {
  if (!q) return true;
  return (
    pl.title.toLowerCase().includes(q) ||
    (pl.description || "").toLowerCase().includes(q) ||
    (pl.author || "").toLowerCase().includes(q)
  );
}

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onClose,
  onPlayTrack,
  onAddToQueue,
  onOpenPlaylist,
  onJoinRoom,
  onToast,
  onPlayList,
  onAddListToQueue,
  queueTracks,
  inline = false,
}) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "local" | "playlists" | "rooms">("all");
  const [onlineResults, setOnlineResults] = useState<Track[]>([]);
  const [ytPlaylists, setYtPlaylists] = useState<RemoteSearchItem[]>([]);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Playlist sources: your library + the global (community) directory. */
  const [localPlaylists, setLocalPlaylists] = useState<CustomPlaylist[]>(() => persistence.getPlaylists());
  const [globalPlaylists, setGlobalPlaylists] = useState<CustomPlaylist[]>([]);

  /* Save-results-as-playlist state. */
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [publishGlobal, setPublishGlobal] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);

  /* Add-to-playlist picker. */
  const [addTarget, setAddTarget] = useState<Track | null>(null);
  const [newPlName, setNewPlName] = useState("");

  /* YouTube playlist import/play busy ids. */
  const [importBusy, setImportBusy] = useState<string | null>(null);

  const pool: Track[] = useMemo(() => {
    const seen = new Set<string>();
    const merged: Track[] = [];
    const push = (t: Track) => {
      const key = VIDEO_KEY(t);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(t);
    };
    if (queueTracks) queueTracks.forEach(push);
    loadCustomTracks().forEach(push);
    TRACKS.forEach(push);
    return merged;
  }, [queueTracks]);

  const roomHistory = persistence.getRoomHistory();
  const q = query.trim().toLowerCase();

  const localMatches = useMemo(() => {
    if (!q) return [];
    return pool.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  }, [pool, q]);

  const onlineMatches = useMemo(() => {
    if (!q) return [];
    const seen = new Set(localMatches.map(VIDEO_KEY));
    return onlineResults.filter((t) => !seen.has(VIDEO_KEY(t)));
  }, [onlineResults, localMatches, q]);

  /* Playlist sections only appear AFTER a keyword is entered (never on a blank search). */
  const yourPlaylists = useMemo(
    () => (!q ? [] : localPlaylists.filter((pl) => plMatches(pl, q)).slice(0, 10)),
    [localPlaylists, q]
  );

  const globalMatches = useMemo(() => {
    if (!q) return [];
    const localIds = new Set(localPlaylists.map((p) => p.id));
    return globalPlaylists.filter((pl) => !localIds.has(pl.id) && plMatches(pl, q)).slice(0, 8);
  }, [globalPlaylists, localPlaylists, q]);

  const filteredRooms = useMemo(
    () => roomHistory.filter((r) => !q || r.name.toLowerCase().includes(q) || r.roomCode.toLowerCase().includes(q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomHistory, q]
  );

  useEffect(() => {
    return subscribeToPlaylistChanges(setLocalPlaylists);
  }, []);

  useEffect(() => {
    const unsub = subscribeToPublicPlaylists(setGlobalPlaylists);
    return unsub;
  }, []);

  /* Refresh the global directory whenever the modal opens. */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchGlobalPublicPlaylists()
      .then((list) => {
        if (alive) setGlobalPlaylists(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setFilter("all");
      setOnlineResults([]);
      setYtPlaylists([]);
      setOnlineBusy(false);
      setSaveOpen(false);
      setSaveTitle("");
      setAddTarget(null);
      setNewPlName("");
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        if (addTarget) setAddTarget(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, addTarget]);

  /* Debounced live YouTube search — songs + playlists in one round-trip. */
  useEffect(() => {
    const queryText = query.trim();
    if (!open || queryText.length < 2 || !navigator.onLine) {
      setOnlineResults([]);
      setYtPlaylists([]);
      setOnlineBusy(false);
      return;
    }
    setOnlineBusy(true);
    const t = window.setTimeout(() => {
      searchYouTubeMixed(queryText, 8)
        .then((mix) => {
          if (query.trim().length >= 2) {
            setOnlineResults(mix.tracks);
            setYtPlaylists(mix.playlists);
          }
        })
        .catch(() => {
          setOnlineResults([]);
          setYtPlaylists([]);
        })
        .finally(() => setOnlineBusy(false));
    }, 380);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  /* ---------------- actions ---------------- */

  const saveTracks = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const t of [...onlineResults, ...localMatches]) {
      const k = VIDEO_KEY(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  }, [onlineResults, localMatches]);

  const createPlaylistFromResults = async () => {
    const title = saveTitle.trim() || query.trim();
    if (!title) return;
    if (!saveTracks.length) {
      onToast("No tracks to save — search for something first");
      return;
    }
    const now = Date.now();
    const pl: CustomPlaylist = {
      id: `pl-${now.toString(36)}`,
      title,
      description: `Created from search “${query.trim()}”`,
      isPublic: false,
      tracks: saveTracks,
      author: "You",
      owner_uid: userId(),
      createdAt: now,
      updatedAt: now,
    };
    setSaveBusy(true);
    persistence.setPlaylists([pl, ...persistence.getPlaylists()]);
    if (publishGlobal) {
      const ok = await publishPlaylist({ ...pl, isPublic: true });
      if (ok) {
        persistence.setPlaylists(
          persistence.getPlaylists().map((p) => (p.id === pl.id ? { ...p, isPublic: true } : p))
        );
        onToast(`Saved “${title}” (${saveTracks.length} tracks) — published to Global`);
      } else {
        onToast(`Saved “${title}” (${saveTracks.length} tracks) — global publish failed`);
      }
    } else {
      onToast(`Saved “${title}” (${saveTracks.length} tracks) to your playlists`);
    }
    setSaveBusy(false);
    setSaveOpen(false);
    setSaveTitle("");
  };

  const addTrackToPlaylist = (pl: CustomPlaylist) => {
    if (!addTarget) return;
    const dup = pl.tracks.some((t) => VIDEO_KEY(t) === VIDEO_KEY(addTarget));
    if (dup) {
      onToast(`Already in “${pl.title}”`);
      setAddTarget(null);
      return;
    }
    const updated = persistence.getPlaylists().map((p) =>
      p.id === pl.id ? { ...p, tracks: [...p.tracks, addTarget], updatedAt: Date.now() } : p
    );
    persistence.setPlaylists(updated);
    onToast(`Added to “${pl.title}”`);
    setAddTarget(null);
    setNewPlName("");
  };

  const createPlaylistAndAdd = () => {
    const title = newPlName.trim();
    if (!title || !addTarget) return;
    const now = Date.now();
    const pl: CustomPlaylist = {
      id: `pl-${now.toString(36)}`,
      title,
      description: "",
      isPublic: false,
      tracks: [addTarget],
      author: "You",
      owner_uid: userId(),
      createdAt: now,
      updatedAt: now,
    };
    persistence.setPlaylists([pl, ...persistence.getPlaylists()]);
    onToast(`Created “${title}” with “${addTarget.title}”`);
    setAddTarget(null);
    setNewPlName("");
  };

  const importYtPlaylist = async (p: RemoteSearchItem) => {
    if (!p.playlistId || importBusy) return;
    setImportBusy(p.playlistId);
    try {
      const tracks = await loadYouTubePlaylist(p.playlistId);
      if (!tracks.length) {
        onToast("Couldn't load that YouTube playlist");
        return;
      }
      const now = Date.now();
      const pl: CustomPlaylist = {
        id: `pl-${now.toString(36)}`,
        title: p.title,
        description: `Imported from YouTube · ${p.author || "YouTube"}`,
        isPublic: false,
        tracks,
        author: p.author || "YouTube",
        owner_uid: userId(),
        coverArt: p.thumbnail || undefined,
        createdAt: now,
        updatedAt: now,
      };
      persistence.setPlaylists([pl, ...persistence.getPlaylists()]);
      onToast(`Saved “${p.title}” (${tracks.length} tracks) to your playlists`);
    } catch {
      onToast("Couldn't load that YouTube playlist");
    } finally {
      setImportBusy(null);
    }
  };

  const playYtPlaylist = async (p: RemoteSearchItem) => {
    if (!p.playlistId || !onPlayList || importBusy) return;
    setImportBusy(p.playlistId);
    try {
      const tracks = await loadYouTubePlaylist(p.playlistId);
      if (!tracks.length) {
        onToast("Couldn't load that YouTube playlist");
        return;
      }
      onPlayList(tracks);
      onClose();
    } catch {
      onToast("Couldn't load that YouTube playlist");
    } finally {
      setImportBusy(null);
    }
  };

  const queueYtPlaylist = async (p: RemoteSearchItem) => {
    if (!p.playlistId || importBusy) return;
    setImportBusy(p.playlistId);
    try {
      const tracks = await loadYouTubePlaylist(p.playlistId);
      if (!tracks.length) {
        onToast("Couldn't load that YouTube playlist");
        return;
      }
      if (onAddListToQueue) onAddListToQueue(tracks);
      else {
        tracks.forEach(onAddToQueue);
        onToast(`Queued “${p.title}” (${tracks.length} tracks)`);
      }
    } catch {
      onToast("Couldn't load that YouTube playlist");
    } finally {
      setImportBusy(null);
    }
  };

  if (!open) return null;

  const showLocal = (filter === "all" || filter === "local") && (localMatches.length > 0 || onlineMatches.length > 0 || onlineBusy);
  const showPlaylists = filter === "all" || filter === "playlists";
  const canSaveResults = q.length >= 2 && saveTracks.length > 0;
  const nothingFound =
    localMatches.length === 0 &&
    onlineMatches.length === 0 &&
    !onlineBusy &&
    yourPlaylists.length === 0 &&
    globalMatches.length === 0 &&
    ytPlaylists.length === 0 &&
    filteredRooms.length === 0;

  const TrackRow: React.FC<{ t: Track }> = ({ t }) => (
    <div className="group flex items-center justify-between rounded-xl p-2 hover:bg-white/[0.06] transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <img
          src={t.thumb || t.coverUrl || t.artwork || "/icon.svg"}
          alt=""
          className="h-9 w-9 rounded-lg object-cover object-center bg-black/40 border border-white/5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-white">{t.title}</div>
          <div className="truncate text-[11px] text-[var(--dim)]">{t.artist}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setAddTarget(t)}
          className="rounded-lg p-1.5 text-[var(--dim)] hover:bg-white/10 hover:text-white"
          title="Add to playlist"
        >
          <FolderMusicIcon size={14} />
        </button>
        <button
          onClick={() => {
            onAddToQueue(t);
            onToast(`Added "${t.title}" to Queue`);
          }}
          className="rounded-lg p-1.5 text-[var(--dim)] hover:bg-white/10 hover:text-white"
          title="Add to queue"
        >
          <PlusIcon size={14} />
        </button>
        <button
          onClick={() => {
            onPlayTrack(t);
            onClose();
          }}
          className="flex items-center gap-1 rounded-lg bg-[var(--acc0)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--acc0)] hover:bg-[var(--acc0)]/30"
        >
          <PlayIcon size={12} />
          Play
        </button>
      </div>
    </div>
  );

  const shell = (
    <>
          {/* Search Input Bar */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
            <SearchIcon size={18} className="text-[var(--acc0)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs, artists, playlists, YouTube or room codes..."
              className="flex-1 bg-transparent text-sm text-white placeholder-[var(--dim)] outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-xs text-[var(--dim)] hover:text-white"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-[var(--dim)] hover:bg-white/10 hover:text-white"
            >
              <XIcon size={18} />
            </button>
          </div>

          {/* Filter Pills + Save-results action */}
          <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-black/20 px-4 py-2 text-xs">
            <div className="flex items-center gap-2">
              {(["all", "local", "playlists", "rooms"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                    filter === f
                      ? "bg-[var(--acc0)] text-black font-semibold"
                      : "text-[var(--dim)] hover:text-white"
                  }`}
                >
                  {f === "local" ? "tracks" : f}
                </button>
              ))}
            </div>
            {canSaveResults && (
              <button
                onClick={() => setSaveOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-md border border-[var(--acc0)]/35 bg-[var(--acc0)]/10 px-2.5 py-1 font-semibold text-[var(--acc0)] transition-colors hover:bg-[var(--acc0)]/20"
                title="Create a playlist from these search results"
              >
                <FolderMusicIcon size={12} />
                save ({saveTracks.length})
              </button>
            )}
          </div>

          {/* Save results as playlist panel */}
          <AnimatePresence initial={false}>
            {saveOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="overflow-hidden border-b border-white/5 bg-black/30"
              >
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <input
                    type="text"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    placeholder={`Playlist name${query.trim() ? ` — "${query.trim()}"` : ""}`}
                    className="min-w-[160px] flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-1.5 text-xs text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
                  />
                  <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-[var(--dim)] hover:text-white">
                    <input
                      type="checkbox"
                      checked={publishGlobal}
                      onChange={(e) => setPublishGlobal(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--acc0)]"
                    />
                    <GlobeIcon size={12} />
                    save to Global
                  </label>
                  <button
                    onClick={createPlaylistFromResults}
                    disabled={saveBusy || !saveTracks.length}
                    className="flex items-center gap-1 rounded-lg bg-[var(--acc0)] px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-40"
                  >
                    <CheckIcon size={12} />
                    {saveBusy ? "saving…" : "create"}
                  </button>
                  <button
                    onClick={() => setSaveOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-[11px] text-[var(--dim)] hover:text-white"
                  >
                    cancel
                  </button>
                </div>
                <p className="px-4 pb-2 text-[10px] text-[var(--dim)]">
                  {saveTracks.length} search result{saveTracks.length === 1 ? "" : "s"} ·{" "}
                  {publishGlobal ? "saved to your playlists AND the Global section" : "saved to your playlists"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results List */}
          <div
            className={
              inline
                ? "scroll-slim min-h-0 flex-1 overflow-y-auto p-3 space-y-4"
                : "scroll-slim max-h-[60vh] overflow-y-auto p-3 space-y-4"
            }
          >
            {/* Local + Online Track Sections */}
            {showLocal && (
              <>
                {localMatches.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                      Your Library ({localMatches.length})
                    </div>
                    <div className="mt-1 space-y-1">
                      {localMatches.slice(0, 8).map((t) => (
                        <TrackRow key={`local-${t.id}`} t={t} />
                      ))}
                    </div>
                  </div>
                )}

                {onlineMatches.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                      YouTube — Search Any Song ({onlineMatches.length})
                    </div>
                    <div className="mt-1 space-y-1">
                      {onlineMatches.map((t) => (
                        <TrackRow key={`online-${t.id}`} t={t} />
                      ))}
                    </div>
                  </div>
                )}

                {onlineBusy && (
                  <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-[var(--dim)]">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--acc0)]" />
                    Searching YouTube (songs + playlists)...
                  </div>
                )}
              </>
            )}

            {/* Your Playlists */}
            {showPlaylists && yourPlaylists.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                  Your Playlists ({yourPlaylists.length})
                </div>
                <div className="mt-1 space-y-1">
                  {yourPlaylists.map((pl) => (
                    <div
                      key={`mine-${pl.id}`}
                      onClick={() => {
                        onOpenPlaylist(pl);
                      }}
                      className="group flex cursor-pointer items-center justify-between rounded-xl p-2 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {pl.coverArt || pl.cover ? (
                          <img
                            src={pl.coverArt || pl.cover}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover bg-black/40 border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[var(--acc0)] shrink-0">
                            <DiscIcon size={16} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-white">{pl.title}</div>
                          <div className="truncate text-[11px] text-[var(--dim)]">
                            {pl.tracks.length} songs · {pl.isPublic ? "Global" : "Private"}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            if (!pl.tracks.length) {
                              onToast("That playlist is empty");
                              return;
                            }
                            if (onAddListToQueue) onAddListToQueue(pl.tracks);
                            else {
                              pl.tracks.forEach(onAddToQueue);
                              onToast(`Queued “${pl.title}” (${pl.tracks.length} tracks)`);
                            }
                          }}
                          className="rounded-lg p-1.5 text-[var(--dim)] hover:bg-white/10 hover:text-white"
                          title="Add playlist to queue"
                        >
                          <PlusIcon size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (!pl.tracks.length || !onPlayList) {
                              onToast("That playlist is empty");
                              return;
                            }
                            onPlayList(pl.tracks);
                            onClose();
                          }}
                          className="flex items-center gap-1 rounded-lg bg-[var(--acc0)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--acc0)] hover:bg-[var(--acc0)]/30"
                          title="Play playlist"
                        >
                          <PlayIcon size={12} />
                          Play
                        </button>
                        <button
                          onClick={() => {
                            onOpenPlaylist(pl);
                          }}
                          className="rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[var(--dim)] hover:border-[var(--acc0)]/50 hover:text-white"
                          title="Open playlist page"
                        >
                          open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Global (community) playlists */}
            {showPlaylists && globalMatches.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                  Global Playlists — Community ({globalMatches.length})
                </div>
                <div className="mt-1 space-y-1">
                  {globalMatches.map((pl) => (
                    <div
                      key={`global-${pl.id}`}
                      onClick={() => {
                        onOpenPlaylist(pl);
                        onClose();
                      }}
                      className="group flex cursor-pointer items-center justify-between rounded-xl p-2 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {pl.coverArt || pl.cover ? (
                          <img
                            src={pl.coverArt || pl.cover}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover bg-black/40 border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--acc0)]/10 border border-white/10 text-[var(--acc0)] shrink-0">
                            <GlobeIcon size={16} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-white">{pl.title}</div>
                          <div className="truncate text-[11px] text-[var(--dim)]">
                            {pl.tracks.length} songs · {pl.author || "Community"}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            if (!pl.tracks.length) {
                              onToast("That playlist is empty");
                              return;
                            }
                            if (onAddListToQueue) onAddListToQueue(pl.tracks);
                            else {
                              pl.tracks.forEach(onAddToQueue);
                              onToast(`Queued “${pl.title}” (${pl.tracks.length} tracks)`);
                            }
                          }}
                          className="rounded-lg p-1.5 text-[var(--dim)] hover:bg-white/10 hover:text-white"
                          title="Add playlist to queue"
                        >
                          <PlusIcon size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (!pl.tracks.length || !onPlayList) {
                              onToast("That playlist is empty");
                              return;
                            }
                            onPlayList(pl.tracks);
                            onClose();
                          }}
                          className="flex items-center gap-1 rounded-lg bg-[var(--acc0)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--acc0)] hover:bg-[var(--acc0)]/30"
                          title="Play playlist"
                        >
                          <PlayIcon size={12} />
                          Play
                        </button>
                        <button
                          onClick={() => {
                            onOpenPlaylist(pl);
                          }}
                          className="rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[var(--dim)] hover:border-[var(--acc0)]/50 hover:text-white"
                          title="Open playlist page"
                        >
                          open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube playlist results */}
            {showPlaylists && ytPlaylists.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                  YouTube — Playlists ({ytPlaylists.length})
                </div>
                <div className="mt-1 space-y-1">
                  {ytPlaylists.map((p) => (
                    <div
                      key={`ytpl-${p.playlistId}`}
                      className="group flex items-center justify-between rounded-xl p-2 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={p.thumbnail || "/icon.svg"}
                          alt=""
                          className="h-9 w-9 rounded-lg object-cover bg-black/40 border border-white/5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-white">{p.title}</div>
                          <div className="truncate text-[11px] text-[var(--dim)]">
                            {p.author || "YouTube"}
                            {p.videoCount ? ` · ${p.videoCount} videos` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => importYtPlaylist(p)}
                          disabled={!!importBusy}
                          className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[var(--dim)] hover:border-[var(--acc0)]/50 hover:text-white disabled:opacity-50"
                          title="Save to your playlists"
                        >
                          <FolderMusicIcon size={12} />
                          {importBusy === p.playlistId ? "loading…" : "save"}
                        </button>
                        <button
                          onClick={() => queueYtPlaylist(p)}
                          disabled={!!importBusy}
                          className="rounded-lg p-1.5 text-[var(--dim)] hover:bg-white/10 hover:text-white disabled:opacity-50"
                          title="Add playlist to queue"
                        >
                          <PlusIcon size={14} />
                        </button>
                        <button
                          onClick={() => playYtPlaylist(p)}
                          disabled={!!importBusy || !onPlayList}
                          className="flex items-center gap-1 rounded-lg bg-[var(--acc0)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--acc0)] hover:bg-[var(--acc0)]/30 disabled:opacity-50"
                          title="Play this playlist"
                        >
                          <PlayIcon size={12} />
                          Play
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rooms Section */}
            {(filter === "all" || filter === "rooms") && filteredRooms.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                  Recent Rooms ({filteredRooms.length})
                </div>
                <div className="mt-1 space-y-1">
                  {filteredRooms.map((rm) => (
                    <div
                      key={rm.roomCode}
                      onClick={() => {
                        onJoinRoom(rm.roomCode);
                        onClose();
                      }}
                      className="group flex cursor-pointer items-center justify-between rounded-xl p-2 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--acc0)]/10 text-[var(--acc0)] shrink-0">
                          <RadioTowerIcon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-white">{rm.name}</div>
                          <div className="font-mono text-[11px] text-[var(--acc0)]">#{rm.roomCode}</div>
                        </div>
                      </div>
                      <span className="text-[11px] text-[var(--acc0)] group-hover:underline">
                        Join Room →
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Blank-search hint / Empty state */}
            {!q && (
              <div className="py-8 text-center text-xs text-[var(--dim)]">
                Type at least 2 characters to search songs, playlists & rooms — paste links to import too.
              </div>
            )}
            {q && nothingFound && (
              <div className="py-8 text-center text-xs text-[var(--dim)]">
                No matching results found for "{query}"
              </div>
            )}
          </div>

          {/* Footer Shortcuts */}
          <div className="flex items-center justify-between border-t border-white/5 bg-black/40 px-4 py-2.5 text-[11px] text-[var(--dim)]">
            <div className="flex items-center gap-3">
              <span><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-white">Esc</kbd> to close</span>
              <span><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-white">⌘K</kbd> to toggle</span>
            </div>
            <span>Songs + Playlists — Library & YouTube</span>
          </div>

          {/* Add-to-playlist picker */}
          <AnimatePresence>
            {addTarget && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                onClick={() => setAddTarget(null)}
              >
                <motion.div
                  initial={{ scale: 0.96, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 10 }}
                  transition={{ duration: 0.15 }}
                  onClick={(e) => e.stopPropagation()}
                  className="screen-surface w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white">Add to playlist</div>
                      <div className="truncate text-[11px] text-[var(--dim)]">{addTarget.title}</div>
                    </div>
                    <button
                      onClick={() => setAddTarget(null)}
                      className="rounded-lg p-1 text-[var(--dim)] hover:bg-white/10 hover:text-white"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                  <div className="scroll-slim max-h-[45vh] overflow-y-auto p-2">
                    {localPlaylists.length === 0 && (
                      <p className="px-2 py-3 text-[11px] text-[var(--dim)]">
                        No playlists yet — create one below.
                      </p>
                    )}
                    {localPlaylists.map((pl) => (
                      <button
                        key={`pick-${pl.id}`}
                        onClick={() => addTrackToPlaylist(pl)}
                        className="flex w-full items-center justify-between rounded-xl p-2 text-left hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-white">{pl.title}</div>
                          <div className="text-[10px] text-[var(--dim)]">
                            {pl.tracks.length} songs · {pl.isPublic ? "Global" : "Private"}
                          </div>
                        </div>
                        <PlusIcon size={14} className="text-[var(--acc0)]" />
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
                    <input
                      type="text"
                      value={newPlName}
                      onChange={(e) => setNewPlName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createPlaylistAndAdd()}
                      placeholder="New playlist name…"
                      className="flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-1.5 text-xs text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
                    />
                    <button
                      onClick={createPlaylistAndAdd}
                      disabled={!newPlName.trim()}
                      className="rounded-lg bg-[var(--acc0)] px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-40"
                    >
                      create
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
    </>
  );

  if (inline) {
    return (
      <div className="screen-surface relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl">
        {shell}
      </div>
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 backdrop-blur-md bg-black/70">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          className="screen-surface relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 shadow-2xl"
        >
          {shell}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
