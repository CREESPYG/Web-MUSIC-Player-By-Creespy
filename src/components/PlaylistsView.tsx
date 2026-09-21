import React, { useEffect, useState } from "react";
import { cn } from "../utils/cn";
import { persistence, type CustomPlaylist, subscribeToPlaylistChanges } from "../lib/persistence";
import type { Track } from "../lib/trackModel";
import { loadYouTubePlaylist } from "../lib/playlist";
import { fetchTrackMeta, parsePlaylistId, parseYouTubeId } from "../lib/media";
import { userId } from "../lib/room";
import {
  isSpotifyUrl,
  loadSpotifyData,
  convertSpotifyTracksToPlayerTracks,
  matchTrackToYouTube,
} from "../lib/spotify";
import {
  fetchGlobalPublicPlaylists,
  publishPlaylist,
  unpublishPlaylist,
  subscribeToPublicPlaylists,
  getGlobalPlaylistLikeCount,
  incrementGlobalPlaylistLikes,
  decrementGlobalPlaylistLikes,
  hasUserLikedGlobalPlaylist,
} from "../lib/publicPlaylists";
import {
  FolderMusicIcon,
  DiscIcon,
  PlusIcon,
  PlayIcon,
  TrashIcon,
  SearchIcon,
  XIcon,
  UploadIcon,
  HeartIcon,
  GlobeIcon,
  LockIcon,
} from "./UiIcons";

interface PlaylistsViewProps {
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayEntirePlaylist: (tracks: Track[]) => void;
  onAddPlaylistToQueue: (tracks: Track[]) => void;
  onToast: (msg: string) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  onPlayTrack,
  onAddToQueue,
  onPlayEntirePlaylist,
  onAddPlaylistToQueue,
  onToast,
}) => {
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>(() => persistence.getPlaylists());
  const [globalPublicPlaylists, setGlobalPublicPlaylists] = useState<CustomPlaylist[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"liked" | "private" | "global">("liked");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(playlists[0]?.id ?? null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  // Edit state
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Add-to-playlist popup state
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Import form state
  const [importInput, setImportInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");

  // Liked tracks from persistence
  const likedTracks: Track[] = persistence.getLikedTracks();

  // Cross-tab sync for private playlists via BroadcastChannel + storage event
  useEffect(() => {
    const unsubChannel = subscribeToPlaylistChanges((updated) => {
      setPlaylists(updated);
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "ripple.central_store.v3" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed.playlists)) {
            setPlaylists(parsed.playlists);
          }
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      unsubChannel();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Global playlist like counts (synced with localStorage)
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    // Initialize from persistence
    const likedIds = persistence.getLikedGlobalPlaylistIds();
    likedIds.forEach((id) => {
      counts[id] = getGlobalPlaylistLikeCount(id);
    });
    return counts;
  });

  const handleToggleGlobalPlaylistLike = (playlistId: string) => {
    const isCurrentlyLiked = hasUserLikedGlobalPlaylist(playlistId);
    let newCount: number;
    if (!isCurrentlyLiked) {
      newCount = incrementGlobalPlaylistLikes(playlistId);
      onToast("Added to liked playlists");
    } else {
      newCount = decrementGlobalPlaylistLikes(playlistId);
      onToast("Removed from liked playlists");
    }
    setLikeCounts((prev) => ({ ...prev, [playlistId]: newCount }));
  };

  // Load global public playlists and subscribe to realtime changes
  useEffect(() => {
    setGlobalLoading(true);
    fetchGlobalPublicPlaylists()
      .then((list) => {
        setGlobalPublicPlaylists(list);
      })
      .finally(() => setGlobalLoading(false));

    const unsub = subscribeToPublicPlaylists((list) => {
      setGlobalPublicPlaylists(list);
    });
    return unsub;
  }, []);

  // Close add-to-playlist popup when clicking anywhere outside it
  useEffect(() => {
    if (!addToPlaylistTrack) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-add-to-playlist-popup]")) {
        setAddToPlaylistTrack(null);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [addToPlaylistTrack]);

  const updatePlaylists = (newList: CustomPlaylist[]) => {
    setPlaylists(newList);
    persistence.setPlaylists(newList);
  };

  // Build the liked songs virtual playlist
  const likedPlaylist: CustomPlaylist = {
    id: "__liked_songs__",
    title: "Liked Songs",
    description: "Your favorite tracks",
    isPublic: false,
    tracks: likedTracks,
    author: "You",
    createdAt: 0,
    updatedAt: Date.now(),
  };

  // Determine which playlists to show in the left pane
  const displayPlaylists = (() => {
    if (activeTab === "global") return globalPublicPlaylists;
    if (activeTab === "private") return playlists.filter((p) => !p.isPublic);
    // "liked" - liked songs + liked global playlists (no duplicates)
    const likedGlobalIds = new Set(persistence.getLikedGlobalPlaylistIds());
    const likedGlobalPlaylists = globalPublicPlaylists.filter((p) => likedGlobalIds.has(p.id));
    return [likedPlaylist, ...likedGlobalPlaylists];
  })();

  const filteredPlaylists = displayPlaylists;

  // selectedPlaylist
  const selectedPlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) ||
    globalPublicPlaylists.find((p) => p.id === selectedPlaylistId) ||
    (selectedPlaylistId === "__liked_songs__" ? likedPlaylist : null) ||
    (activeTab === "liked" ? likedPlaylist : null) ||
    (activeTab === "global" ? globalPublicPlaylists[0] : null) ||
    (activeTab === "private" ? playlists.filter((p) => !p.isPublic)[0] : null);

  const filteredTracks = selectedPlaylist
    ? selectedPlaylist.tracks.filter(
        (t) =>
          !filterQuery.trim() ||
          t.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
          t.artist.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : [];

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const newPl: CustomPlaylist = {
      id: `pl-${Date.now()}`,
      title: newTitle.trim(),
      description: newDesc.trim() || "Custom user playlist",
      isPublic: false,
      tracks: [],
      author: "You",
      owner_uid: userId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newPl, ...playlists];
    updatePlaylists(updated);
    setSelectedPlaylistId(newPl.id);
    setNewTitle("");
    setNewDesc("");
    setShowCreateModal(false);
    onToast(`Created playlist "${newPl.title}"`);
  };

  const handleDeletePlaylist = async (id: string) => {
    const target = playlists.find((p) => p.id === id);
    const updated = playlists.filter((p) => p.id !== id);
    updatePlaylists(updated);
    if (selectedPlaylistId === id) {
      setSelectedPlaylistId(updated[0]?.id ?? null);
    }
    // Remove from global DB if it was public
    if (target?.isPublic) {
      await unpublishPlaylist(id);
    }
    onToast("Playlist deleted");
  };

  const handleTogglePrivacy = async (id: string) => {
    const target = playlists.find((p) => p.id === id);
    if (!target) return;

    const wasPublic = target.isPublic;
    const newIsPublic = !wasPublic;
    const updated = playlists.map((p) => {
      if (p.id === id) return { ...p, isPublic: newIsPublic, updatedAt: Date.now() };
      return p;
    });
    updatePlaylists(updated);

    if (newIsPublic) {
      const ok = await publishPlaylist({ ...target, isPublic: true, updatedAt: Date.now() });
      onToast(ok ? "Playlist published globally" : "Failed to publish");
    } else {
      const ok = await unpublishPlaylist(id);
      onToast(ok ? "Playlist is now Private" : "Failed to unpublish");
    }
  };

  const handleRemoveTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    const updated = playlists.map((p) => {
      if (p.id === playlistId) {
        return {
          ...p,
          tracks: p.tracks.filter((t) => t.id !== trackId && t.videoId !== trackId),
          updatedAt: Date.now(),
        };
      }
      return p;
    });
    updatePlaylists(updated);
    // Sync to Supabase if public
    const target = updated.find((p) => p.id === playlistId);
    if (target?.isPublic) {
      await publishPlaylist(target);
    }
    onToast("Track removed from playlist");
  };

  const handleStartEdit = (pl: CustomPlaylist) => {
    setEditingPlaylistId(pl.id);
    setEditTitle(pl.title);
    setEditDesc(pl.description);
  };

  const handleSaveEdit = async () => {
    if (!editingPlaylistId || !editTitle.trim()) return;
    const updated = playlists.map((p) => {
      if (p.id === editingPlaylistId) {
        return { ...p, title: editTitle.trim(), description: editDesc.trim(), updatedAt: Date.now() };
      }
      return p;
    });
    updatePlaylists(updated);
    // Also update in Supabase if public
    const target = updated.find((p) => p.id === editingPlaylistId);
    if (target?.isPublic) {
      await publishPlaylist(target);
    }
    setEditingPlaylistId(null);
    onToast("Playlist updated");
  };

  const handleCancelEdit = () => {
    setEditingPlaylistId(null);
  };

  const handleAddToPlaylist = async (track: Track, playlistId: string) => {
    const updated = playlists.map((p) => {
      if (p.id === playlistId) {
        const exists = p.tracks.some((t) => t.videoId === track.videoId);
        if (exists) {
          onToast(`"${track.title}" is already in "${p.title}"`);
          return p;
        }
        return {
          ...p,
          tracks: [...p.tracks, track],
          updatedAt: Date.now(),
        };
      }
      return p;
    });
    updatePlaylists(updated);
    const target = updated.find((p) => p.id === playlistId);
    if (target) {
      if (target.isPublic) {
        await publishPlaylist(target);
      }
      onToast(`Added "${track.title}" to "${target.title}"`);
    }
    setAddToPlaylistTrack(null);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importInput.trim() || !selectedPlaylist) return;

    setImporting(true);
    setImportStatus("Parsing playlist link...");

    try {
      const input = importInput.trim();

      // Check Spotify URL first
      if (isSpotifyUrl(input)) {
        setImportStatus("Fetching Spotify metadata & tracks...");
        const spData = await loadSpotifyData(input, (done, total) => {
          setImportStatus(`Loading Spotify tracks ${done}/${total}...`);
        });

        if (spData.tracks.length > 0) {
          setImportStatus(`Matching ${spData.tracks.length} songs to audio streams...`);
          const loaded = await convertSpotifyTracksToPlayerTracks(
            spData.tracks,
            spData.title,
            (done, total) => {
              setImportStatus(`Matching audio streams: ${done}/${total}...`);
            }
          );

          const updated = playlists.map((p) => {
            if (p.id === selectedPlaylist.id) {
              const existingIds = new Set(p.tracks.map((t) => t.id));
              const newTracks = loaded.filter((t) => !existingIds.has(t.id));
              return {
                ...p,
                tracks: [...p.tracks, ...newTracks],
                cover: p.cover || spData.cover || newTracks[0]?.thumb || p.tracks[0]?.thumb,
                updatedAt: Date.now(),
              };
            }
            return p;
          });
          updatePlaylists(updated);
          if (selectedPlaylist.isPublic) {
            const pubTarget = updated.find((p) => p.id === selectedPlaylist.id);
            if (pubTarget) await publishPlaylist(pubTarget);
          }
          setImportInput("");
          setShowImportModal(false);
          onToast(`Imported ${loaded.length} Spotify tracks to "${selectedPlaylist.title}"`);
          return;
        }
      }

      // Check YouTube Playlist ID
      const playlistId = parsePlaylistId(input);
      if (playlistId) {
        setImportStatus("Connecting to YouTube playlist...");
        const loaded = await loadYouTubePlaylist(playlistId, (done, total) => {
          setImportStatus(`Resolving song titles: ${done}/${total || "?"}...`);
        });
        if (loaded && loaded.length > 0) {
          const updated = playlists.map((p) => {
            if (p.id === selectedPlaylist.id) {
              const existingIds = new Set(p.tracks.map((t) => t.videoId));
              const newTracks = loaded.filter((t) => !existingIds.has(t.videoId));
              return {
                ...p,
                tracks: [...p.tracks, ...newTracks],
                cover: p.cover || newTracks[0]?.thumb || p.tracks[0]?.thumb,
                updatedAt: Date.now(),
              };
            }
            return p;
          });
          updatePlaylists(updated);
          if (selectedPlaylist.isPublic) {
            const pubTarget = updated.find((p) => p.id === selectedPlaylist.id);
            if (pubTarget) await publishPlaylist(pubTarget);
          }
          setImportInput("");
          setShowImportModal(false);
          onToast(`Imported ${loaded.length} tracks with real titles to "${selectedPlaylist.title}"`);
          return;
        }
      }

      // Parse line by line for YouTube Video URLs, IDs, or Song Names
      const lines = input.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
      const results: Track[] = [];
      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const line = lines[i];
        const vid = parseYouTubeId(line) || (line.length === 11 && !line.includes(" ") ? line : null);
        if (vid) {
          setImportStatus(`Loading track ${i + 1}/${lines.length}...`);
          const meta = await fetchTrackMeta(vid);
          const trk: Track = {
            id: `yt-${vid}-${Date.now()}-${i}`,
            videoId: vid,
            title: meta.title || `Track ${i + 1}`,
            artist: meta.artist || "YouTube Artist",
            album: selectedPlaylist.title,
            duration: meta.duration || 180,
            thumb: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            sourceType: "youtube",
            sourceUrl: `https://www.youtube.com/watch?v=${vid}`,
            source: "custom",
            bpm: 100,
            seed: i + 1,
            addedAt: Date.now(),
          };
          results.push(trk);
        } else if (line.length > 2) {
          setImportStatus(`Searching audio for "${line.slice(0, 20)}"...`);
          const matchedVid = await matchTrackToYouTube(line, "");
          if (matchedVid) {
            const meta = await fetchTrackMeta(matchedVid);
            results.push({
              id: `matched-${matchedVid}-${Date.now()}-${i}`,
              videoId: matchedVid,
              title: meta.title || line,
              artist: meta.artist || "Artist",
              album: selectedPlaylist.title,
              duration: meta.duration || 180,
              thumb: `https://i.ytimg.com/vi/${matchedVid}/hqdefault.jpg`,
              artwork: `https://i.ytimg.com/vi/${matchedVid}/hqdefault.jpg`,
              sourceType: "youtube",
              sourceUrl: `https://www.youtube.com/watch?v=${matchedVid}`,
              source: "custom",
              bpm: 100,
              seed: i + 1,
              addedAt: Date.now(),
            });
          }
        }
      }

      if (results.length > 0) {
        const updated = playlists.map((p) => {
          if (p.id === selectedPlaylist.id) {
            const existingIds = new Set(p.tracks.map((t) => t.videoId));
            const newTracks = results.filter((t) => !existingIds.has(t.videoId));
            return {
              ...p,
              tracks: [...p.tracks, ...newTracks],
              cover: p.cover || newTracks[0]?.thumb || p.tracks[0]?.thumb,
              updatedAt: Date.now(),
            };
          }
          return p;
        });
        updatePlaylists(updated);
        if (selectedPlaylist.isPublic) {
          const pubTarget = updated.find((p) => p.id === selectedPlaylist.id);
          if (pubTarget) await publishPlaylist(pubTarget);
        }
        setImportInput("");
        setShowImportModal(false);
        onToast(`Added ${results.length} track${results.length === 1 ? "" : "s"} with album art sync`);
      } else {
        setImportStatus("Please enter a valid YouTube or Spotify playlist link or song names.");
      }
    } catch (err: any) {
      setImportStatus(err?.message || "Import failed. Please check the playlist link.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-4 md:px-6 max-w-5xl mx-auto space-y-4">
      {/* Top action row: compact tab filter on left, actions on right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/8 pb-3 shrink-0">
        {/* Compact, Theme-Synced Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 p-1">
          {(["liked", "private", "global"] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-tmono text-[10.5px] font-semibold uppercase tracking-wider transition-all",
                  active
                    ? "bg-[var(--acc0)] text-black shadow-[0_0_12px_-3px_var(--acc0)] font-bold"
                    : "text-[var(--dim)] hover:text-white hover:bg-white/5"
                )}
              >
                {tab === "liked" ? (
                  <>
                    <HeartIcon size={12} className={active ? "fill-black" : ""} /> Liked ({likedTracks.length})
                  </>
                ) : tab === "global" ? (
                  <>
                    <GlobeIcon size={12} /> Global ({globalPublicPlaylists.length})
                  </>
                ) : (
                  <>
                    <LockIcon size={11} /> Private ({playlists.filter((p) => !p.isPublic && p.id !== "__liked_songs__").length})
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--acc0)] px-3 py-1.5 font-tmono text-[10.5px] font-bold uppercase tracking-wider text-black transition-all hover:brightness-110 shadow-sm"
          >
            <PlusIcon size={13} />
            New Playlist
          </button>

          {selectedPlaylist && selectedPlaylist.id !== "__liked_songs__" && (
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 font-tmono text-[10.5px] font-semibold uppercase tracking-wider text-white hover:bg-white/10"
            >
              <UploadIcon size={13} />
              Import Tracks
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Left Playlists + Right Tracklist */}
      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4 min-h-0 flex-1">
        {/* Left: Playlists List */}
        <div className="space-y-2">
          {/* Playlists Cards */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {activeTab === "global" && globalLoading && (
              <div className="flex items-center justify-center py-8 text-[var(--dim)]">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[var(--acc0)]" />
                <span className="ml-2.5 text-xs">Loading global playlists...</span>
              </div>
            )}
            {filteredPlaylists.length === 0 && !(activeTab === "global" && globalLoading) ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-[var(--dim)]">
                  <FolderMusicIcon size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">
                    {activeTab === "global"
                      ? "No Global Playlists Yet"
                      : activeTab === "liked"
                      ? "No Liked Songs"
                      : activeTab === "private"
                      ? "No Private Playlists"
                      : "No Playlists Yet"}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--dim)] leading-relaxed">
                    {activeTab === "global"
                      ? "No one has published a global playlist yet. Be the first!"
                      : activeTab === "liked"
                      ? "Like songs from the player to save them here."
                      : "Create your first playlist or import tracks from YouTube or Spotify."}
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--acc0)] px-3.5 py-1.5 text-xs font-bold text-black hover:brightness-110 shadow-sm"
                >
                  <PlusIcon size={13} />
                  New Playlist
                </button>
              </div>
            ) : (
              filteredPlaylists.map((pl) => {
                const isSelected = selectedPlaylist?.id === pl.id;
                const isLiked = pl.id === "__liked_songs__";
                const isGlobal = pl.isPublic && pl.id !== "__liked_songs__";
                const isGlobalLiked = isGlobal && hasUserLikedGlobalPlaylist(pl.id);
                const globalLikeCount = isGlobal ? (likeCounts[pl.id] || getGlobalPlaylistLikeCount(pl.id)) : 0;
                const firstCover = pl.cover || pl.tracks[0]?.thumb || pl.tracks[0]?.coverUrl || "/cover-placeholder.jpg";

                return (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`group flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-[var(--acc0)] bg-[var(--acc0)]/10 shadow-md"
                        : "border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/10"
                        style={
                          isLiked
                            ? {
                                background:
                                  "linear-gradient(135deg, color-mix(in srgb, var(--acc0) 40%, transparent), color-mix(in srgb, var(--acc2) 50%, transparent))",
                                borderColor: "var(--acc0)",
                              }
                            : undefined
                        }
                      >
                        {pl.tracks.length > 0 || pl.cover ? (
                          <img src={firstCover} alt="" className="h-full w-full object-cover object-center" onError={(e) => { (e.target as HTMLImageElement).src = "/cover-placeholder.jpg"; }} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--dim)]">
                            {isLiked ? <HeartIcon size={16} className="text-white fill-current" /> : <DiscIcon size={16} />}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-white">{pl.title}</span>
                          {isLiked ? (
                            <span title="Liked Songs" className="text-[var(--acc0)]"><HeartIcon size={11} className="fill-current" /></span>
                          ) : isGlobal ? (
                            <span title="Global" className="text-emerald-400"><GlobeIcon size={12} /></span>
                          ) : (
                            <span title="Private" className="text-[var(--dim)]"><LockIcon size={11} /></span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-[var(--dim)] truncate">
                          {pl.tracks.length} songs {!isLiked && `• ${pl.author}`}
                          {isGlobal && globalLikeCount > 0 && (
                            <span className="ml-1 text-[var(--acc0)] font-medium">
                              <HeartIcon size={10} className="inline fill-current" /> {globalLikeCount}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Like button for global playlists */}
                    {isGlobal && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleGlobalPlaylistLike(pl.id);
                        }}
                        className={`shrink-0 rounded-lg p-1.5 transition-colors ${
                          isGlobalLiked
                            ? "text-[var(--acc0)] hover:bg-[var(--acc0)]/10"
                            : "text-[var(--dim)] hover:bg-white/10 hover:text-[var(--acc0)]"
                        }`}
                        title={isGlobalLiked ? "Unlike playlist" : "Like playlist"}
                      >
                        <HeartIcon size={14} className={isGlobalLiked ? "fill-current" : ""} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected Playlist Details & Tracklist */}
        <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 min-w-0">
          {selectedPlaylist ? (
            <div className="space-y-4">
              {/* Playlist Banner Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex-1">
                  {editingPlaylistId === selectedPlaylist.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-bold text-white outline-none focus:border-[var(--acc0)]"
                        placeholder="Playlist name"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-[var(--dim)] outline-none focus:border-[var(--acc0)]"
                        placeholder="Description"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="rounded-lg bg-[var(--acc0)] px-3 py-1 text-[11px] font-bold text-black hover:brightness-110"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="rounded-lg px-3 py-1 text-[11px] text-[var(--dim)] hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white">{selectedPlaylist.title}</h2>
                        {selectedPlaylist.id !== "__liked_songs__" && (!selectedPlaylist.owner_uid || selectedPlaylist.owner_uid === userId()) && (
                          <span
                            onClick={() => handleTogglePrivacy(selectedPlaylist.id)}
                            className={`cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                              selectedPlaylist.isPublic
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {selectedPlaylist.isPublic ? "Global" : "Private"}
                          </span>
                        )}
                        {selectedPlaylist.id !== "__liked_songs__" && (!selectedPlaylist.owner_uid || selectedPlaylist.owner_uid === userId()) && (
                          <button
                            onClick={() => handleStartEdit(selectedPlaylist)}
                            title="Edit playlist"
                            className="rounded-lg p-1 text-[var(--dim)] hover:bg-white/10 hover:text-white"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[var(--dim)]">{selectedPlaylist.description}</p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={!selectedPlaylist.tracks.length}
                    onClick={() => onPlayEntirePlaylist(selectedPlaylist.tracks)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--acc0)] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-40"
                  >
                    <PlayIcon size={14} />
                    Play All
                  </button>

                  <button
                    disabled={!selectedPlaylist.tracks.length}
                    onClick={() => onAddPlaylistToQueue(selectedPlaylist.tracks)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    <PlusIcon size={14} />
                    Queue
                  </button>

                  {/* Like button for global playlists in detail view */}
                  {selectedPlaylist.isPublic && selectedPlaylist.id !== "__liked_songs__" && (
                    <button
                      onClick={() => handleToggleGlobalPlaylistLike(selectedPlaylist.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        persistence.isGlobalPlaylistLiked(selectedPlaylist.id)
                          ? "bg-pink-500/15 border border-pink-500/30 text-pink-400"
                          : "border border-white/15 bg-white/5 text-[var(--dim)] hover:bg-white/10 hover:text-pink-400"
                      }`}
                    >
                      <HeartIcon
                        size={13}
                        className={persistence.isGlobalPlaylistLiked(selectedPlaylist.id) ? "fill-current" : ""}
                      />
                      {likeCounts[selectedPlaylist.id] || getGlobalPlaylistLikeCount(selectedPlaylist.id) || 0}
                    </button>
                  )}

                  {selectedPlaylist.id !== "__liked_songs__" && (!selectedPlaylist.owner_uid || selectedPlaylist.owner_uid === userId()) && (
                    <button
                      onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                      title="Delete playlist"
                      className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10"
                    >
                      <TrashIcon size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* In-playlist search input */}
              {selectedPlaylist.tracks.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <SearchIcon size={14} className="text-[var(--dim)]" />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder={`Search within ${selectedPlaylist.tracks.length} tracks...`}
                    className="flex-1 bg-transparent text-xs text-white placeholder-[var(--dim)] outline-none"
                  />
                  {filterQuery && (
                    <button onClick={() => setFilterQuery("")} className="text-[10px] text-[var(--dim)]">
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Tracklist */}
              <div className="max-h-[50vh] overflow-y-auto space-y-1.5 pr-1">
                {filteredTracks.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[var(--dim)]">
                    {selectedPlaylist.tracks.length === 0
                      ? selectedPlaylist.id === "__liked_songs__"
                        ? "No liked songs yet. Click the heart icon on any track to save it here!"
                        : "This playlist has no tracks yet. Click 'Import Tracks' to add music!"
                      : "No tracks match your search filter."}
                  </div>
                ) : (
                  filteredTracks.map((t, idx) => (
                    <div
                      key={`${t.id || t.videoId}-${idx}`}
                      className="group flex items-center justify-between rounded-xl p-2 hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-5 text-center font-mono text-xs text-[var(--dim)]">
                          {idx + 1}
                        </span>
                        <img
                          src={t.thumb || t.coverUrl || "/cover-placeholder.jpg"}
                          alt=""
                          className="h-9 w-9 rounded-lg object-cover object-center bg-black/40 border border-white/5 shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/cover-placeholder.jpg"; }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-white">{t.title}</div>
                          <div className="truncate text-[10px] text-[var(--dim)]">{t.artist}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100">
                        {/* Add to playlist button */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Always close any existing popup first, then toggle
                              if (addToPlaylistTrack?.videoId === t.videoId) {
                                setAddToPlaylistTrack(null);
                              } else {
                                setAddToPlaylistTrack(t);
                              }
                            }}
                            className="rounded-lg p-1.5 text-[var(--dim)] hover:bg-white/10 hover:text-[var(--acc0)]"
                            title="Add to playlist"
                          >
                            <PlusIcon size={14} />
                          </button>
                          {addToPlaylistTrack?.videoId === t.videoId && (
                            <div
                              data-add-to-playlist-popup
                              className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-white/15 bg-[#0e1626] p-2 shadow-2xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="mb-1 px-2 py-1 text-[10px] font-semibold text-[var(--dim)] uppercase tracking-wider">
                                Add to Playlist
                              </div>
                              {playlists.length === 0 ? (
                                <div className="px-2 py-3 text-center text-[11px] text-[var(--dim)]">
                                  No playlists yet. Create one first!
                                </div>
                              ) : (
                                playlists.map((pl) => {
                                  const alreadyIn = pl.tracks.some((trk) => trk.videoId === t.videoId);
                                  return (
                                    <button
                                      key={pl.id}
                                      onClick={() => handleAddToPlaylist(t, pl.id)}
                                      disabled={alreadyIn}
                                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                                        alreadyIn
                                          ? "text-[var(--dim)] opacity-40 cursor-not-allowed"
                                          : "text-white hover:bg-white/10"
                                      }`}
                                    >
                                      <FolderMusicIcon size={12} />
                                      <span className="truncate flex-1">{pl.title}</span>
                                      {alreadyIn && <span className="text-[9px] text-[var(--dim)]">Added</span>}
                                    </button>
                                  );
                                })
                              )}
                              <button
                                onClick={() => setAddToPlaylistTrack(null)}
                                className="mt-1 w-full rounded-lg px-2 py-1 text-center text-[10px] text-[var(--dim)] hover:text-white hover:bg-white/5"
                              >
                                Close
                              </button>
                            </div>
                          )}
                        </div>

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
                          onClick={() => onPlayTrack(t)}
                          className="flex items-center gap-1 rounded-lg bg-[var(--acc0)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--acc0)] hover:bg-[var(--acc0)]/30"
                        >
                          <PlayIcon size={12} />
                          Play
                        </button>
                        {selectedPlaylist.id !== "__liked_songs__" && (
                          <button
                            onClick={() => handleRemoveTrackFromPlaylist(selectedPlaylist.id, t.id)}
                            className="rounded-lg p-1.5 text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400"
                            title="Remove track"
                          >
                            <TrashIcon size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[var(--acc0)]">
                <FolderMusicIcon size={26} />
              </div>
              <div className="max-w-xs space-y-1.5">
                <p className="text-sm font-semibold text-white">No Playlist Selected</p>
                <p className="text-xs text-[var(--dim)] leading-relaxed">
                  Select a playlist from the left, or create a new playlist to start adding your favorite songs from YouTube and Spotify.
                </p>
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--acc0)] px-4 py-2 text-xs font-bold text-black hover:brightness-110 shadow-sm"
                >
                  <PlusIcon size={14} /> Create Playlist
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Playlist */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0e1626] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Create New Playlist</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-[var(--dim)] hover:text-white">
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-white block mb-1">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Late Night Beats"
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-xs text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white block mb-1">Description</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Ambient & atmospheric vibes"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-xs text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl px-4 py-2 text-xs text-[var(--dim)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--acc0)] px-4 py-2 text-xs font-bold text-black hover:brightness-110 shadow-sm"
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import Tracks */}
      {showImportModal && selectedPlaylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0e1626] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Import to "{selectedPlaylist.title}"</h3>
                <p className="text-[11px] text-[var(--dim)] mt-0.5">Sync songs, album art & titles automatically</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-[var(--dim)] hover:text-white">
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-white">Supported Sources</label>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 text-[9px] font-bold">
                      YouTube
                    </span>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold">
                      Spotify
                    </span>
                  </div>
                </div>
                <textarea
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder="Paste YouTube playlist URL, Spotify playlist/album link, or YouTube video links (1 per line)..."
                  rows={4}
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)] font-mono"
                />
              </div>

              {importStatus && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--acc0)]/10 border border-[var(--acc0)]/20 px-3 py-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--acc0)] border-t-transparent shrink-0" />
                  <p className="text-xs text-[var(--acc0)] font-medium truncate">{importStatus}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="rounded-xl px-4 py-2 text-xs text-[var(--dim)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || !importInput.trim()}
                  className="rounded-xl bg-[var(--acc0)] px-4 py-2 text-xs font-bold text-black disabled:opacity-40"
                >
                  {importing ? "Importing..." : "Start Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
