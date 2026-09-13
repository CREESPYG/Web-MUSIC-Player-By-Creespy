import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TRACKS } from "../data/tracks";
import { persistence, type CustomPlaylist } from "../lib/persistence";
import type { Track } from "../lib/trackModel";
import {
  SearchIcon,
  XIcon,
  PlayIcon,
  PlusIcon,
  DiscIcon,
  RadioTowerIcon,
} from "./UiIcons";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onOpenPlaylist: (playlistId: string) => void;
  onJoinRoom: (roomCode: string) => void;
  onToast: (msg: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onClose,
  onPlayTrack,
  onAddToQueue,
  onOpenPlaylist,
  onJoinRoom,
  onToast,
}) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "tracks" | "playlists" | "rooms">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const allTracks: Track[] = TRACKS;
  const playlists: CustomPlaylist[] = persistence.getPlaylists();
  const roomHistory = persistence.getRoomHistory();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();

  const filteredTracks = allTracks.filter(
    (t) => !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );

  const filteredPlaylists = playlists.filter(
    (p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  );

  const filteredRooms = roomHistory.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.roomCode.toLowerCase().includes(q)
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 backdrop-blur-md bg-black/70">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#0e1626]/95 shadow-2xl backdrop-blur-2xl"
        >
          {/* Search Input Bar */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
            <SearchIcon size={18} className="text-[var(--acc0)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracks, artists, playlists, or room codes..."
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

          {/* Filter Pills */}
          <div className="flex items-center gap-2 border-b border-white/5 bg-black/20 px-4 py-2 text-xs">
            {(["all", "tracks", "playlists", "rooms"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-[var(--acc0)] text-black font-semibold"
                    : "text-[var(--dim)] hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Results List */}
          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
            {/* Tracks Section */}
            {(filter === "all" || filter === "tracks") && filteredTracks.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                  Tracks ({filteredTracks.length})
                </div>
                <div className="mt-1 space-y-1">
                  {filteredTracks.slice(0, 8).map((t) => (
                    <div
                      key={t.id}
                      className="group flex items-center justify-between rounded-xl p-2 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={t.coverUrl || t.artwork || "/cover-placeholder.jpg"}
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
                  ))}
                </div>
              </div>
            )}

            {/* Playlists Section */}
            {(filter === "all" || filter === "playlists") && filteredPlaylists.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                  Playlists ({filteredPlaylists.length})
                </div>
                <div className="mt-1 space-y-1">
                  {filteredPlaylists.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => {
                        onOpenPlaylist(pl.id);
                        onClose();
                      }}
                      className="group flex cursor-pointer items-center justify-between rounded-xl p-2 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[var(--acc0)] shrink-0">
                          <DiscIcon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-white">{pl.title}</div>
                          <div className="truncate text-[11px] text-[var(--dim)]">
                            {pl.tracks.length} songs • {pl.isPublic ? "Public" : "Private"}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] text-[var(--acc0)] group-hover:underline">
                        Open →
                      </span>
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

            {/* Empty state */}
            {filteredTracks.length === 0 && filteredPlaylists.length === 0 && filteredRooms.length === 0 && (
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
            <span>Global Audio Search</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
