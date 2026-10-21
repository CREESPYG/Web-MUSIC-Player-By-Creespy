import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  FolderMusicIcon,
  HeartIcon,
  HistoryIcon,
  ListMusicIcon,
  MusicNoteIcon,
  PlayIcon,
  PinIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  GlobeIcon,
} from "./UiIcons";
import { persistence, subscribeToPlaylistChanges, type CustomPlaylist } from "../lib/persistence";
import { fetchGlobalPublicPlaylists } from "../lib/publicPlaylists";
import { subscribeOpenPlaylist } from "../lib/openPlaylistBus";
import type { Track } from "../lib/trackModel";
import { PlaylistsView } from "./PlaylistsView";
import { cn } from "../utils/cn";

interface Props {
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayEntirePlaylist: (tracks: Track[]) => void;
  onAddPlaylistToQueue: (tracks: Track[]) => void;
  onToast: (msg: string) => void;
}

type CollectionTab = "collection" | "community";
type LibView = "grid" | "box";
type DetailKind = { kind: "liked" } | { kind: "history" } | { kind: "playlist"; id: string };

function shuffleCopy(tracks: Track[]): Track[] {
  const arr = [...tracks];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function trackArt(t: Track): string {
  return t.thumb || t.coverUrl || t.artwork || "/icon.svg";
}

function fmtDur(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const LibraryScreen: React.FC<Props> = ({
  onPlayTrack,
  onAddToQueue,
  onPlayEntirePlaylist,
  onAddPlaylistToQueue,
  onToast,
}) => {
  const [tab, setTab] = useState<CollectionTab>("collection");
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>(() => persistence.getPlaylists());
  const [pinned, setPinned] = useState<CustomPlaylist[]>(() => persistence.getPinnedGlobalPlaylists());
  const likedTracks = useMemo(() => persistence.getLikedTracks(), []);
  const historyItems = useMemo(() => persistence.getTrackHistory(), []);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [libView, setLibView] = useState<LibView>("grid");
  /* Forwarded to PlaylistsView when a GLOBAL playlist is opened from search. */
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);

  useEffect(() => subscribeToPlaylistChanges(setPlaylists), []);

  // Route "open playlist" requests from the Search section into this screen.
  useEffect(() => {
    return subscribeOpenPlaylist((id) => {
      const found = [...pinned, ...playlists].find((p) => p.id === id);
      if (found) {
        setTab("collection");
        setDetail({ kind: "playlist", id });
        return;
      }
      setTab("community");
      setOpenPlaylistId(id);
    });
  }, [playlists, pinned]);

  // Refresh pinned global snapshots so tracks/metadata stay current.
  useEffect(() => {
    let alive = true;
    fetchGlobalPublicPlaylists()
      .then((list) => {
        if (!alive) return;
        const cur = persistence.getPinnedGlobalPlaylists();
        if (!cur.length) return;
        const map = new Map(list.map((g) => [g.id, g]));
        const refreshed = cur.map((p) => map.get(p.id) ?? p);
        persistence.setPreferences({ pinnedGlobalPlaylists: refreshed });
        setPinned(refreshed);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const unpinPl = (pl: CustomPlaylist, goBack = false) => {
    persistence.unpinGlobalPlaylist(pl.id);
    setPinned((prev) => prev.filter((p) => p.id !== pl.id));
    if (goBack) setDetail(null);
    onToast(`Unpinned “${pl.title}” from Collection`);
  };

  const activePlaylist = detail?.kind === "playlist"
    ? [...pinned, ...playlists].find((p) => p.id === detail.id) ?? null
    : null;
  const activeIsPinned = detail?.kind === "playlist" ? pinned.some((p) => p.id === detail.id) : false;

  const detailMeta = (() => {
    if (!detail) return null;
    if (detail.kind === "liked") return { title: "Favorites", subtitle: "Tracks you liked", icon: HeartIcon, tracks: likedTracks };
    if (detail.kind === "history")
      return {
        title: "History",
        subtitle: "Recently played",
        icon: HistoryIcon,
        tracks: historyItems.map((h) => h.track),
      };
    if (activePlaylist)
      return {
        title: activePlaylist.title,
        subtitle: activePlaylist.description || (activePlaylist.isPublic ? "Pinned community playlist" : "Private playlist"),
        icon: activePlaylist.isPublic ? GlobeIcon : FolderMusicIcon,
        tracks: activePlaylist.tracks,
      };
    return null;
  })();

  const createPlaylist = () => {
    const title = newTitle.trim();
    if (!title) return;
    const now = Date.now();
    const pl: CustomPlaylist = {
      id: `pl-${now.toString(36)}`,
      title,
      description: "",
      isPublic: false,
      tracks: [],
      author: "You",
      createdAt: now,
      updatedAt: now,
    };
    persistence.setPlaylists([pl, ...persistence.getPlaylists()]);
    setNewTitle("");
    setShowCreate(false);
    setDetail({ kind: "playlist", id: pl.id });
    onToast(`Playlist “${title}” created`);
  };

  const deletePlaylist = (pl: CustomPlaylist) => {
    if (!window.confirm(`Delete playlist “${pl.title}”? This cannot be undone.`)) return;
    persistence.setPlaylists(persistence.getPlaylists().filter((p) => p.id !== pl.id));
    setDetail(null);
    onToast("Playlist deleted");
  };

  const queueDetail = (tracks: Track[]) => {
    if (!tracks.length) return;
    onAddPlaylistToQueue(tracks);
  };

  const playDetail = (tracks: Track[]) => {
    if (!tracks.length) {
      onToast("No tracks to play");
      return;
    }
    onPlayEntirePlaylist(tracks);
  };

  const TrackRow: React.FC<{ t: Track; idx: number }> = ({ t, idx }) => (
    <div className="group flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:border-white/8 hover:bg-white/4">
      <span className="w-5 shrink-0 text-center font-tmono text-[10px] text-[var(--dim)] group-hover:hidden">{idx + 1}</span>
      <button
        onClick={() => onPlayTrack(t)}
        className="hidden w-5 shrink-0 place-items-center text-[var(--acc0)] group-hover:grid"
        aria-label={`Play ${t.title}`}
      >
        <PlayIcon size={13} />
      </button>
      <img
        src={trackArt(t)}
        alt=""
        className="h-9 w-9 shrink-0 rounded-md border border-white/10 object-cover"
        onError={(e) => ((e.target as HTMLImageElement).src = "/icon.svg")}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-[var(--ink)]">{t.title}</p>
        <p className="truncate text-[10.5px] text-[var(--dim)]">{t.artist}</p>
      </div>
      {t.duration ? <span className="font-tmono text-[9.5px] text-[var(--dim)]">{fmtDur(t.duration)}</span> : null}
      <button
        onClick={() => onAddToQueue(t)}
        title="Add to queue"
        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--dim)] opacity-0 transition-opacity hover:bg-white/8 hover:text-[var(--acc0)] group-hover:opacity-100"
      >
        <PlusIcon size={14} />
      </button>
    </div>
  );

  const CollectionCard: React.FC<{
    title: string;
    meta: string;
    icon: React.ReactNode;
    cover?: string;
    onClick: () => void;
    accent?: boolean;
    onRemove?: () => void;
  }> = ({ title, meta, icon, cover, onClick, accent, onRemove }) => (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border border-white/8 bg-white/4 p-4 text-left transition-colors hover:border-white/20 hover:bg-white/6"
    >
      <span
        className={cn(
          "grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10",
          accent ? "text-black" : "bg-black/40 text-[var(--acc0)]"
        )}
        style={accent ? { background: "linear-gradient(135deg,var(--acc0),var(--acc1))" } : undefined}
      >
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : icon}
      </span>
      <div className="min-w-0 w-full">
        <p className="truncate text-[13px] font-bold text-[var(--ink)]">{title}</p>
        <p className="truncate font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]">{meta}</p>
      </div>
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onRemove();
            }
          }}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/50 text-white/60 opacity-0 transition-opacity hover:text-[#ff9aa6] group-hover:opacity-100"
          aria-label="Remove"
        >
          <TrashIcon size={13} />
        </span>
      )}
    </motion.button>
  );

  /* ---- Collection model (rendered as grid cards or box rows) ---- */
  type LibItem = {
    key: string;
    title: string;
    meta: string;
    icon: React.ReactNode;
    cover?: string;
    accent?: boolean;
    onClick: () => void;
    onRemove?: () => void;
  };

  const collectionItems: LibItem[] = [
    ...pinned.map<LibItem>((pl) => ({
      key: `pinned-${pl.id}`,
      title: pl.title,
      meta: `${pl.tracks.length} track${pl.tracks.length === 1 ? "" : "s"} · pinned`,
      icon: <PinIcon size={26} />,
      cover: pl.cover || pl.coverArt,
      onClick: () => setDetail({ kind: "playlist", id: pl.id }),
      onRemove: () => unpinPl(pl),
    })),
    {
      key: "liked",
      title: "Favorites",
      meta: `${likedTracks.length} liked tracks`,
      icon: <HeartIcon size={26} />,
      accent: true,
      onClick: () => setDetail({ kind: "liked" }),
    },
    {
      key: "history",
      title: "History",
      meta: `${historyItems.length} recently played`,
      icon: <HistoryIcon size={26} />,
      onClick: () => setDetail({ kind: "history" }),
    },
    ...playlists.map<LibItem>((pl) => ({
      key: pl.id,
      title: pl.title,
      meta: `${pl.tracks.length} track${pl.tracks.length === 1 ? "" : "s"}${pl.isPublic ? " · public" : ""}`,
      icon: pl.isPublic ? <GlobeIcon size={26} /> : <FolderMusicIcon size={26} />,
      cover: pl.cover || pl.coverArt,
      onClick: () => setDetail({ kind: "playlist", id: pl.id }),
      onRemove: () => deletePlaylist(pl),
    })),
  ];

  const createSlot = showCreate ? (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[var(--acc0)]/50 bg-[var(--acc0)]/5 p-4">
      <input
        autoFocus
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") createPlaylist();
          if (e.key === "Escape") {
            setShowCreate(false);
            setNewTitle("");
          }
        }}
        placeholder="Playlist name"
        className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/70 focus:border-[var(--acc0)]"
      />
      <div className="flex gap-2">
        <button
          onClick={createPlaylist}
          className="flex-1 rounded-lg bg-[var(--acc0)] px-3 py-1.5 font-tmono text-[9.5px] font-bold uppercase tracking-[0.14em] text-black"
        >
          create
        </button>
        <button
          onClick={() => {
            setShowCreate(false);
            setNewTitle("");
          }}
          className="rounded-lg border border-white/12 px-3 py-1.5 font-tmono text-[9.5px] uppercase tracking-[0.14em] text-[var(--dim)] hover:text-white"
        >
          cancel
        </button>
      </div>
    </div>
  ) : null;

  const CollectionRow: React.FC<Omit<LibItem, "key">> = ({ title, meta, icon, cover, accent, onClick, onRemove }) => (
    <motion.button
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/6"
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10",
          accent ? "text-black" : "bg-black/40 text-[var(--acc0)]"
        )}
        style={accent ? { background: "linear-gradient(135deg,var(--acc0),var(--acc1))" } : undefined}
      >
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">{title}</span>
        <span className="block truncate font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]">{meta}</span>
      </span>
      <span className="font-tmono text-[11px] text-[var(--dim)] transition-colors group-hover:text-[var(--acc0)]">›</span>
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onRemove();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white/60 opacity-0 transition-opacity hover:text-[#ff9aa6] group-hover:opacity-100"
          aria-label="Remove"
        >
          <TrashIcon size={13} />
        </span>
      )}
    </motion.button>
  );

  return (
    <div className="screen-surface flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10">
      {/* Header + tabs */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--acc0)]/15 text-[var(--acc0)]">
            <FolderMusicIcon size={18} />
          </span>
          <div>
            <h1 className="font-display text-sm font-bold uppercase tracking-wider text-white">Library</h1>
            <p className="font-tmono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]">
              {playlists.length} playlists · {likedTracks.length} liked · {historyItems.length} recent
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="glass flex items-center gap-1 rounded-full p-1">
            {(["collection", "community"] as CollectionTab[]).map((id) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  setDetail(null);
                }}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-tmono text-[9.5px] uppercase tracking-[0.16em] transition-colors",
                  tab === id ? "bg-[var(--acc0)] text-black" : "text-[var(--dim)] hover:text-[var(--ink)]"
                )}
              >
                {id === "collection" ? "collection" : "community"}
              </button>
            ))}
          </div>

          {/* Grid / Box view toggle — applies to Collection AND Community */}
          <div className="glass flex items-center gap-1 rounded-full p-1" role="radiogroup" aria-label="Library view mode">
            {(["grid", "box"] as LibView[]).map((v) => (
              <button
                key={v}
                onClick={() => setLibView(v)}
                title={v === "grid" ? "Grid view" : "Box view"}
                aria-label={v === "grid" ? "Grid view" : "Box view"}
                role="radio"
                aria-checked={libView === v}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full transition-colors",
                  libView === v ? "bg-[var(--acc0)] text-black" : "text-[var(--dim)] hover:text-[var(--ink)]"
                )}
              >
                {v === "grid" ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
                    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
                    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
                    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="7" rx="2" />
                    <rect x="3" y="14" width="18" height="6" rx="2" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
        {tab === "community" ? (
          <div className="flex min-h-full flex-col">
            <PlaylistsView
              viewMode={libView}
              openPlaylistId={openPlaylistId}
              onPlayTrack={onPlayTrack}
              onAddToQueue={onAddToQueue}
              onPlayEntirePlaylist={onPlayEntirePlaylist}
              onAddPlaylistToQueue={onAddPlaylistToQueue}
              onToast={onToast}
            />
          </div>
        ) : detailMeta ? (
          /* ------- Collection detail (musike-style hero + tracklist) ------- */
          <div className="flex min-h-full flex-col gap-4">
            <div className="flex items-start gap-4">
              <button
                onClick={() => setDetail(null)}
                className="glass mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full font-tmono text-[13px] text-[var(--dim)] hover:text-white"
                aria-label="Back to collection"
              >
                ←
              </button>
              <div
                className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/12 bg-black/40 text-[var(--acc0)]"
              >
                {detail?.kind === "playlist" && activePlaylist?.cover ? (
                  <img src={activePlaylist.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <detailMeta.icon size={34} />
                )}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <p className="font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--acc0)]">
                  {detail?.kind === "playlist" ? "playlist" : detail?.kind === "liked" ? "favorites" : "history"}
                </p>
                <h2 className="truncate font-display text-xl font-bold uppercase tracking-wide text-white">
                  {detailMeta.title}
                </h2>
                <p className="truncate text-[11.5px] text-[var(--dim)]">
                  {detailMeta.subtitle} · {detailMeta.tracks.length} track{detailMeta.tracks.length === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => playDetail(detailMeta.tracks)}
                    className="flex items-center gap-1.5 rounded-full px-4 py-2 font-tmono text-[10px] font-bold uppercase tracking-[0.14em] text-black transition-transform hover:scale-105"
                    style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                  >
                    <PlayIcon size={13} /> play all
                  </button>
                  <button
                    onClick={() => playDetail(shuffleCopy(detailMeta.tracks))}
                    className="glass flex items-center gap-1.5 rounded-full px-4 py-2 font-tmono text-[10px] uppercase tracking-[0.14em] text-[var(--dim)] transition-colors hover:text-[var(--acc0)]"
                  >
                    <RefreshCwIcon size={13} /> shuffle
                  </button>
                  <button
                    onClick={() => queueDetail(detailMeta.tracks)}
                    className="glass flex items-center gap-1.5 rounded-full px-4 py-2 font-tmono text-[10px] uppercase tracking-[0.14em] text-[var(--dim)] transition-colors hover:text-[var(--acc0)]"
                  >
                    <ListMusicIcon size={13} /> queue all
                  </button>
                  {detail?.kind === "playlist" && activePlaylist && (
                    activeIsPinned ? (
                      <button
                        onClick={() => unpinPl(activePlaylist, true)}
                        className="glass flex items-center gap-1.5 rounded-full px-4 py-2 font-tmono text-[10px] uppercase tracking-[0.14em] text-[var(--dim)] transition-colors hover:text-[var(--acc0)]"
                      >
                        <PinIcon size={13} className="fill-current" /> unpin
                      </button>
                    ) : (
                      <button
                        onClick={() => deletePlaylist(activePlaylist)}
                        className="glass flex items-center gap-1.5 rounded-full px-4 py-2 font-tmono text-[10px] uppercase tracking-[0.14em] text-[var(--dim)] transition-colors hover:text-[#ff9aa6]"
                      >
                        <TrashIcon size={13} /> delete
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {detailMeta.tracks.length === 0 ? (
                <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-white/12 px-6 py-12 text-center">
                  <MusicNoteIcon size={26} />
                  <p className="font-tmono text-[10px] uppercase tracking-[0.16em] text-[var(--dim)]">
                    {detail?.kind === "playlist" ? "Empty playlist — add tracks from search" : "Nothing here yet"}
                  </p>
                </div>
              ) : (
                detailMeta.tracks.map((t, i) => <TrackRow key={`${t.id || t.videoId}-${i}`} t={t} idx={i} />)
              )}
            </div>
          </div>
        ) : libView === "grid" ? (
          /* ------- Collection · grid view ------- */
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {collectionItems.map((it) => (
              <CollectionCard
                key={it.key}
                title={it.title}
                meta={it.meta}
                icon={it.icon}
                cover={it.cover}
                accent={it.accent}
                onClick={it.onClick}
                onRemove={it.onRemove}
              />
            ))}
            {createSlot ?? (
              <CollectionCard
                title="New Playlist"
                meta="create a private list"
                icon={<PlusIcon size={26} />}
                onClick={() => setShowCreate(true)}
              />
            )}
          </div>
        ) : (
          /* ------- Collection · box view ------- */
          <div className="flex flex-col gap-2">
            {collectionItems.map(({ key, ...it }) => (
              <CollectionRow key={key} {...it} />
            ))}
            {createSlot ?? (
              <CollectionRow
                title="New Playlist"
                meta="create a private list"
                icon={<PlusIcon size={20} />}
                onClick={() => setShowCreate(true)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
