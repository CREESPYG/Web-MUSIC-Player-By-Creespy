import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { Track } from "../../../lib/trackModel";
import {
  persistence,
  type CustomPlaylist,
  subscribeToPlaylistChanges,
} from "../../../lib/persistence";
import {
  fetchGlobalPublicPlaylists,
  subscribeToPublicPlaylists,
  hasUserLikedGlobalPlaylist,
  getGlobalPlaylistLikeCount,
  incrementGlobalPlaylistLikes,
  decrementGlobalPlaylistLikes,
} from "../../../lib/publicPlaylists";
import { HeartIcon } from "../../Icons";
import {
  SearchIcon,
  FolderMusicIcon,
  PlusIcon,
  CloseIcon,
  PlayIcon,
  TrashIcon,
  GlobeIcon,
  LockIcon,
  ListMusicIcon,
} from "../../UiIcons";

interface Props {
  currentTrackId?: string;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayEntirePlaylist?: (tracks: Track[]) => void;
  onAddPlaylistToQueue?: (tracks: Track[]) => void;
  likedTrackIds: Set<string>;
  onToggleLike: (track: Track) => void;
  onToast: (msg: string) => void;
}

type Tab = "liked" | "private" | "global";
type View = "list" | "detail";

export function MobilePlaylistScreen({
  currentTrackId,
  onPlayTrack,
  onAddToQueue,
  onPlayEntirePlaylist,
  onAddPlaylistToQueue,
  likedTrackIds,
  onToggleLike,
  onToast,
}: Props) {
  const [tab, setTab] = useState<Tab>("liked");
  const [view, setView] = useState<View>("list");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [playlists, setPlaylists] = useState<CustomPlaylist[]>(() => persistence.getPlaylists());
  const [globalPlaylists, setGlobalPlaylists] = useState<CustomPlaylist[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalLikeCounts, setGlobalLikeCounts] = useState<Record<string, number>>({});

  const scrollRef = useRef<HTMLDivElement>(null);

  // Cross-tab playlist sync
  useEffect(() => {
    return subscribeToPlaylistChanges((updated) => setPlaylists(updated));
  }, []);

  // Load global playlists
  useEffect(() => {
    setGlobalLoading(true);
    fetchGlobalPublicPlaylists()
      .then(setGlobalPlaylists)
      .finally(() => setGlobalLoading(false));
    return subscribeToPublicPlaylists(setGlobalPlaylists);
  }, []);

  const likedTracks: Track[] = useMemo(() => persistence.getLikedTracks(), [likedTrackIds]);

  const likedPlaylist: CustomPlaylist = useMemo(
    () => ({
      id: "__liked_songs__",
      title: "Liked Songs",
      description: "Your favorite tracks",
      isPublic: false,
      tracks: likedTracks,
      author: "You",
      createdAt: 0,
      updatedAt: Date.now(),
    }),
    [likedTracks]
  );

  // Resolve selected playlist
  const selectedPlaylist = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId === "__liked_songs__") return likedPlaylist;
    return (
      playlists.find((p) => p.id === selectedId) ||
      globalPlaylists.find((p) => p.id === selectedId) ||
      null
    );
  }, [selectedId, playlists, globalPlaylists, likedPlaylist]);

  // Display playlists per tab
  const displayPlaylists = useMemo(() => {
    if (tab === "liked") {
      const likedGlobalIds = new Set(persistence.getLikedGlobalPlaylistIds());
      const likedGlobal = globalPlaylists.filter((p) => likedGlobalIds.has(p.id));
      return [likedPlaylist, ...likedGlobal];
    }
    if (tab === "private") return playlists.filter((p) => !p.isPublic);
    return globalPlaylists;
  }, [tab, playlists, globalPlaylists, likedPlaylist]);

  // Filter playlists by search
  const filteredPlaylists = useMemo(() => {
    if (!search.trim()) return displayPlaylists;
    const q = search.toLowerCase();
    return displayPlaylists.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.author?.toLowerCase().includes(q)
    );
  }, [displayPlaylists, search]);

  // Filter tracks in selected playlist
  const filteredTracks = useMemo(() => {
    if (!selectedPlaylist) return [];
    const tracks = selectedPlaylist.tracks;
    if (!search.trim()) return tracks;
    const q = search.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [selectedPlaylist, search]);

  // Auto-select first playlist when switching tabs
  useEffect(() => {
    if (filteredPlaylists.length > 0 && !filteredPlaylists.find((p) => p.id === selectedId)) {
      setSelectedId(filteredPlaylists[0].id);
      setView("list");
    }
  }, [tab, filteredPlaylists.length]);

  const openPlaylist = useCallback((id: string) => {
    setSelectedId(id);
    setView("detail");
    setSearch("");
    scrollRef.current?.scrollTo(0, 0);
  }, []);

  const goBack = useCallback(() => {
    setView("list");
    setSearch("");
  }, []);

  const createPlaylist = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    const newPl: CustomPlaylist = {
      id: `pl-${Date.now().toString(36)}`,
      title,
      description: newDesc.trim(),
      isPublic: false,
      tracks: [],
      author: "You",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...playlists, newPl];
    setPlaylists(updated);
    persistence.setPlaylists(updated);
    setSelectedId(newPl.id);
    setView("detail");
    setShowCreate(false);
    setNewTitle("");
    setNewDesc("");
    onToast(`Created "${title}"`);
  }, [newTitle, newDesc, playlists, onToast]);

  const deletePlaylist = useCallback(
    (pl: CustomPlaylist) => {
      if (pl.id === "__liked_songs__") return;
      const updated = playlists.filter((p) => p.id !== pl.id);
      setPlaylists(updated);
      persistence.setPlaylists(updated);
      if (selectedId === pl.id) {
        setSelectedId(updated[0]?.id ?? null);
        setView("list");
      }
      onToast(`Deleted "${pl.title}"`);
    },
    [playlists, selectedId, onToast]
  );

  const removeTrackFromPlaylist = useCallback(
    (pl: CustomPlaylist, trackIdx: number) => {
      if (pl.id === "__liked_songs__") {
        const track = pl.tracks[trackIdx];
        if (track) onToggleLike(track);
        return;
      }
      const updated = pl.tracks.filter((_, i) => i !== trackIdx);
      const newPl = { ...pl, tracks: updated, updatedAt: Date.now() };
      const newList = playlists.map((p) => (p.id === pl.id ? newPl : p));
      setPlaylists(newList);
      persistence.setPlaylists(newList);
      onToast("Track removed");
    },
    [playlists, onToast, onToggleLike]
  );

  const playAll = useCallback(() => {
    if (!selectedPlaylist || selectedPlaylist.tracks.length === 0) return;
    if (onPlayEntirePlaylist) {
      onPlayEntirePlaylist(selectedPlaylist.tracks);
    } else {
      selectedPlaylist.tracks.forEach((t) => onAddToQueue(t));
      onPlayTrack(selectedPlaylist.tracks[0]);
    }
  }, [selectedPlaylist, onPlayEntirePlaylist, onPlayTrack, onAddToQueue]);

  const queueAll = useCallback(() => {
    if (!selectedPlaylist || selectedPlaylist.tracks.length === 0) return;
    if (onAddPlaylistToQueue) {
      onAddPlaylistToQueue(selectedPlaylist.tracks);
    } else {
      selectedPlaylist.tracks.forEach((t) => onAddToQueue(t));
      onToast(`Added ${selectedPlaylist.tracks.length} tracks to Queue`);
    }
  }, [selectedPlaylist, onAddPlaylistToQueue, onAddToQueue, onToast]);

  const handleGlobalLike = useCallback(
    (plId: string) => {
      const isLiked = hasUserLikedGlobalPlaylist(plId);
      let newCount: number;
      if (!isLiked) {
        newCount = incrementGlobalPlaylistLikes(plId);
        onToast("Added to liked playlists");
      } else {
        newCount = decrementGlobalPlaylistLikes(plId);
        onToast("Removed from liked playlists");
      }
      setGlobalLikeCounts((prev) => ({ ...prev, [plId]: newCount }));
    },
    [onToast]
  );

  const thumbUrl = (t?: Track) =>
    t?.thumb || (t?.videoId ? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg` : "");

  // ─── CREATE MODAL ───
  if (showCreate) {
    return (
      <div className="flex h-full flex-col px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--dim)] hover:text-white"
          >
            <CloseIcon size={16} />
          </button>
          <h3 className="font-display text-sm font-bold text-[var(--ink)]">New Playlist</h3>
        </div>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Playlist name"
          autoFocus
          className="mb-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-body text-xs text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
        />
        <input
          type="text"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="Description (optional)"
          className="mb-4 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-body text-xs text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
        />
        <button
          type="button"
          onClick={createPlaylist}
          disabled={!newTitle.trim()}
          className="w-full rounded-xl py-2.5 font-display text-xs font-bold text-black disabled:opacity-40"
          style={{ background: "var(--acc0)" }}
        >
          Create Playlist
        </button>
      </div>
    );
  }

  // ─── DETAIL VIEW (playlist tracks) ───
  if (view === "detail" && selectedPlaylist) {
    const pl = selectedPlaylist;
    const isLiked = pl.id === "__liked_songs__";
    const isGlobal = pl.isPublic && !isLiked;

    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Playlist Header */}
        <div className="shrink-0 border-b border-white/8 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--dim)] hover:text-white active:scale-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-sm font-bold text-[var(--ink)]">
                {pl.title}
              </h3>
              <p className="text-[10px] text-[var(--dim)]">
                {pl.tracks.length} track{pl.tracks.length !== 1 ? "s" : ""}
                {isGlobal && " · Global"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {pl.tracks.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={playAll}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-display text-[10px] font-bold text-black shadow-sm transition-transform active:scale-95"
                    style={{ background: "var(--acc0)" }}
                    title="Play all tracks"
                  >
                    <PlayIcon size={12} />
                    <span>Play All</span>
                  </button>
                  <button
                    type="button"
                    onClick={queueAll}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-display text-[10px] font-semibold text-[var(--ink)] transition-transform hover:text-white active:scale-95"
                    title="Queue all tracks"
                  >
                    <PlusIcon size={12} />
                    <span>Queue All</span>
                  </button>
                </>
              )}
              {isGlobal && (
                <button
                  type="button"
                  onClick={() => handleGlobalLike(pl.id)}
                  className={`grid h-8 w-8 place-items-center rounded-lg active:scale-90 ${
                    hasUserLikedGlobalPlaylist(pl.id) ? "text-[#f43f5e]" : "text-[var(--dim)]"
                  }`}
                >
                  <HeartIcon size={15} filled={hasUserLikedGlobalPlaylist(pl.id)} />
                </button>
              )}
              {!isLiked && !isGlobal && (
                <button
                  type="button"
                  onClick={() => { deletePlaylist(pl); }}
                  className="grid h-8 w-8 place-items-center rounded-lg text-[var(--dim)] hover:text-[#f43f5e] active:scale-90"
                  title="Delete playlist"
                >
                  <TrashIcon size={14} />
                </button>
              )}
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search in playlist…"
              className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-8 pr-3 font-body text-[11px] text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
            />
            <span className="pointer-events-none absolute left-2.5 top-2 text-[var(--dim)]">
              <SearchIcon size={12} />
            </span>
          </div>
        </div>

        {/* Track List */}
        <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-6">
          {filteredTracks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <FolderMusicIcon size={28} className="mb-2 text-[var(--dim)]/40" />
              <p className="font-display text-[11px] font-semibold text-[var(--dim)]">
                {search ? "No tracks match your search" : "No tracks in this playlist"}
              </p>
            </div>
          ) : (
            filteredTracks.map((tr, idx) => {
              const isPlaying = tr.id === currentTrackId;
              const isTrackLiked = likedTrackIds.has(tr.id);
              const realIdx = selectedPlaylist.tracks.findIndex((t) => t.id === tr.id);

              return (
                <div
                  key={`${pl.id}-${tr.id}-${idx}`}
                  onClick={() => onPlayTrack(tr)}
                  className={`group flex items-center gap-2.5 rounded-xl border p-2 transition-all active:scale-[0.99] ${
                    isPlaying
                      ? "border-[var(--acc0)]/50 bg-[var(--acc0)]/10"
                      : "border-white/6 bg-white/[0.02] hover:border-white/15"
                  }`}
                >
                  {/* Index / Playing indicator */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {isPlaying ? (
                      <span className="live-dot h-2 w-2 rounded-full bg-[var(--acc0)]" />
                    ) : (
                      <span className="font-tmono text-[10px] text-[var(--dim)]/60">
                        {idx + 1}
                      </span>
                    )}
                  </div>

                  {/* Artwork + Titles */}
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                      <img src={thumbUrl(tr)} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[11px] font-bold ${
                          isPlaying ? "text-[var(--acc0)]" : "text-[var(--ink)]"
                        }`}
                      >
                        {tr.title}
                      </span>
                      <span className="block truncate text-[9px] text-[var(--dim)]">
                        {tr.artist || "CREESPY"}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex shrink-0 items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onAddToQueue(tr);
                        onToast(`Added to Queue`);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-md text-[var(--dim)] transition-colors hover:text-white active:scale-90"
                    >
                      <PlusIcon size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleLike(tr)}
                      className={`grid h-7 w-7 place-items-center rounded-md transition-transform active:scale-90 ${
                        isTrackLiked ? "text-[#f43f5e]" : "text-[var(--dim)] hover:text-white"
                      }`}
                    >
                      <HeartIcon size={12} filled={isTrackLiked} />
                    </button>
                    {!isLiked && realIdx >= 0 && (
                      <button
                        type="button"
                        onClick={() => removeTrackFromPlaylist(pl, realIdx)}
                        className="grid h-7 w-7 place-items-center rounded-md text-[var(--dim)] transition-colors hover:text-[#f43f5e] active:scale-90"
                      >
                        <TrashIcon size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ─── LIST VIEW (tabs + playlist cards) ───
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tabs */}
      <div className="shrink-0 border-b border-white/8 px-4 pt-3 pb-2">
        <div className="mb-2 flex gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-0.5">
          {(["liked", "private", "global"] as Tab[]).map((t) => {
            const counts: Record<Tab, number> = {
              liked: likedTracks.length,
              private: playlists.filter((p) => !p.isPublic).length,
              global: globalPlaylists.length,
            };
            const icons: Record<Tab, React.ReactNode> = {
              liked: <HeartIcon size={10} />,
              private: <LockIcon size={10} />,
              global: <GlobeIcon size={10} />,
            };
            const labels: Record<Tab, string> = {
              liked: "Liked",
              private: "Mine",
              global: "Global",
            };
            const isActive = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setSearch(""); }}
                className="relative flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 font-display text-[9px] font-bold uppercase tracking-wider transition-colors"
                style={{ background: isActive ? "var(--acc0)" : "transparent", color: isActive ? "#000" : "var(--dim)" }}
              >
                {icons[t]}
                {labels[t]} ({counts[t]})
                {isActive && (
                  <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-black/20" />
                )}
              </button>
            );
          })}
        </div>

        {/* Search + Create */}
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search playlists…"
              className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-8 pr-3 font-body text-[11px] text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
            />
            <span className="pointer-events-none absolute left-2.5 top-2 text-[var(--dim)]">
              <SearchIcon size={11} />
            </span>
          </div>
          {tab !== "global" && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 font-display text-[10px] font-bold text-black"
              style={{ background: "var(--acc0)" }}
            >
              <PlusIcon size={11} />
              New
            </button>
          )}
        </div>
      </div>

      {/* Playlist List */}
      <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-6">
        {tab === "global" && globalLoading && (
          <div className="flex items-center justify-center py-8 text-[var(--dim)]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[var(--acc0)]" />
            <span className="ml-2 text-[10px]">Loading global playlists…</span>
          </div>
        )}

        {filteredPlaylists.length === 0 && !(tab === "global" && globalLoading) && (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <FolderMusicIcon size={28} className="mb-2 text-[var(--dim)]/40" />
            <p className="font-display text-[11px] font-semibold text-[var(--dim)]">
              {tab === "liked"
                ? "No liked songs yet"
                : tab === "private"
                ? "No playlists yet"
                : "No global playlists yet"}
            </p>
            <p className="mt-1 text-[9px] text-[var(--dim)]/70">
              {tab === "liked"
                ? "Like songs from the player to save them here."
                : "Tap New to create your first playlist."}
            </p>
          </div>
        )}

        {filteredPlaylists.map((pl) => {
          const isLiked = pl.id === "__liked_songs__";
          const isGlobal = pl.isPublic && !isLiked;
          const globalLiked = isGlobal && hasUserLikedGlobalPlaylist(pl.id);
          const globalCount = isGlobal ? (globalLikeCounts[pl.id] ?? getGlobalPlaylistLikeCount(pl.id)) : 0;

          return (
            <div
              key={pl.id}
              onClick={() => openPlaylist(pl.id)}
              className="mb-1.5 flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.02] p-2.5 transition-all hover:border-white/15 active:scale-[0.99]"
            >
              {/* Cover */}
              <div
                className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black"
                style={
                  isLiked
                    ? {
                        background: "linear-gradient(135deg, rgba(244,63,94,0.3), rgba(139,92,246,0.3))",
                        borderColor: "rgba(244,63,94,0.3)",
                      }
                    : undefined
                }
              >
                {(pl.cover || pl.tracks[0]?.thumb) ? (
                  <img src={pl.cover || pl.tracks[0]?.thumb || ""} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--dim)]/40">
                    <ListMusicIcon size={18} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {isLiked && <HeartIcon size={10} className="shrink-0 text-[#f43f5e]" />}
                  {isGlobal && <GlobeIcon size={10} className="shrink-0 text-[var(--acc0)]" />}
                  {!isLiked && !isGlobal && <LockIcon size={9} className="shrink-0 text-[var(--dim)]" />}
                  <span className="truncate text-[11px] font-bold text-[var(--ink)]">
                    {pl.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-[var(--dim)]">
                    {pl.tracks.length} track{pl.tracks.length !== 1 ? "s" : ""}
                  </span>
                  {isGlobal && (
                    <span className="flex items-center gap-0.5 text-[9px] text-[var(--dim)]">
                      <HeartIcon size={8} filled={!!globalLiked} className={globalLiked ? "text-[#f43f5e]" : ""} />
                      {globalCount}
                    </span>
                  )}
                </div>
              </div>

                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {pl.tracks.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (onPlayEntirePlaylist) onPlayEntirePlaylist(pl.tracks);
                          else onPlayTrack(pl.tracks[0]);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--acc0)] hover:bg-white/10 active:scale-90"
                        title="Play all"
                      >
                        <PlayIcon size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (onAddPlaylistToQueue) onAddPlaylistToQueue(pl.tracks);
                          else pl.tracks.forEach((t) => onAddToQueue(t));
                          onToast(`Added ${pl.tracks.length} tracks to Queue`);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--dim)] hover:text-white hover:bg-white/10 active:scale-90"
                        title="Queue all"
                      >
                        <PlusIcon size={13} />
                      </button>
                    </>
                  )}
                </div>

                {/* Arrow */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--dim)]/40">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
          );
        })}
      </div>
    </div>
  );
}
