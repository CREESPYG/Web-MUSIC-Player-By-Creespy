import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Track } from "../lib/trackModel";
import { fmtTime } from "../lib/color";
import { SparkIcon } from "./UiIcons";
import { cn } from "../utils/cn";

interface QueueViewProps {
  tracks: Track[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
  onRemoveTrack: (index: number) => void;
  onClearQueue: () => void;
  onMagicTopUp: () => void;
  magicBusy: boolean;
  isPlaying: boolean;
  onOpenSearch: () => void;
  onSaveQueueAsPlaylist: (name: string) => void;
}

export function QueueView({
  tracks,
  currentIndex,
  onSelectTrack,
  onRemoveTrack,
  onClearQueue,
  onMagicTopUp,
  magicBusy,
  isPlaying,
  onOpenSearch,
  onSaveQueueAsPlaylist,
}: QueueViewProps) {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");

  const currentTrack = tracks[currentIndex] || tracks[0];

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    onSaveQueueAsPlaylist(playlistName.trim());
    setPlaylistName("");
    setSaveModalOpen(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 md:py-8 space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="font-display text-[24px] sm:text-[30px] font-bold text-[var(--ink)]">
            Playback Queue ({tracks.length})
          </h1>
          <p className="text-[12.5px] text-[var(--dim)] mt-0.5">
            Manage your active listening queue, reorder tracks, and discover similar vibes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onMagicTopUp}
            disabled={magicBusy}
            className="px-3.5 py-1.5 rounded-full glass-soft border border-white/15 text-[12px] font-semibold text-[var(--ink)] hover:bg-white/10 transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <SparkIcon size={13} className={magicBusy ? "animate-spin text-[var(--acc0)]" : "text-[var(--acc0)]"} />
            <span>{magicBusy ? "Discovering..." : "Auto Mix"}</span>
          </button>

          <button
            onClick={onOpenSearch}
            className="px-4 py-1.5 rounded-full font-bold text-[12px] text-black shadow-md hover:scale-105 transition-transform"
            style={{ background: "var(--acc0)" }}
          >
            + Add Song
          </button>

          <button
            onClick={() => setSaveModalOpen(true)}
            className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[12px] font-medium text-[var(--ink)] transition-colors"
          >
            Save as Playlist
          </button>

          {tracks.length > 1 && (
            <button
              onClick={onClearQueue}
              className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Now Playing Banner */}
      {currentTrack && (
        <div className="glass-soft rounded-3xl p-4 md:p-5 border border-white/15 shadow-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative h-14 w-14 shrink-0 rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/15">
              <img
                src={currentTrack.thumb}
                alt={currentTrack.title}
                className={cn("h-full w-full object-cover", isPlaying ? "disc-spin disc-spin-on" : "")}
              />
            </div>

            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[var(--acc0)]/20 text-[var(--acc0)] border border-[var(--acc0)]/30">
                  Now Playing
                </span>
                {isPlaying && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-0.5 bg-[var(--acc0)] animate-pulse" />
                    <span className="h-3 w-0.5 bg-[var(--acc0)] animate-pulse delay-75" />
                    <span className="h-2 w-0.5 bg-[var(--acc0)] animate-pulse delay-150" />
                  </span>
                )}
              </div>
              <h2 className="font-display text-[15px] md:text-[17px] font-bold text-[var(--ink)] truncate mt-1">
                {currentTrack.title}
              </h2>
              <p className="text-[12px] text-[var(--dim)] truncate">{currentTrack.artist}</p>
            </div>
          </div>
        </div>
      )}

      {/* Queue List */}
      <div className="glass-soft rounded-3xl p-4 md:p-6 border border-white/10 shadow-xl space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--dim)] px-2 mb-2">
          Up Next in Sequence ({tracks.length} tracks)
        </h2>

        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto no-scrollbar">
          {tracks.map((track, idx) => {
            const isCurrent = idx === currentIndex;

            return (
              <motion.div
                key={`${track.videoId}-${idx}`}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className={cn(
                  "group flex items-center justify-between gap-3 p-2 rounded-2xl transition-all duration-150",
                  isCurrent
                    ? "bg-white/15 border border-white/20 shadow-sm"
                    : "hover:bg-white/10 border border-transparent"
                )}
              >
                {/* Index & Track Info */}
                <div
                  className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer"
                  onClick={() => onSelectTrack(idx)}
                >
                  <span
                    className={cn(
                      "w-5 text-center text-[11.5px] font-mono",
                      isCurrent ? "text-[var(--acc0)] font-bold" : "text-[var(--dim)]"
                    )}
                  >
                    {isCurrent ? "▶" : idx + 1}
                  </span>

                  <img
                    src={track.thumb}
                    alt={track.title}
                    className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                  />

                  <div className="min-w-0 text-left flex-1">
                    <p
                      className={cn(
                        "truncate text-[13px] font-semibold",
                        isCurrent ? "text-[var(--acc0)]" : "text-[var(--ink)]"
                      )}
                    >
                      {track.title}
                    </p>
                    <p className="truncate text-[11px] text-[var(--dim)]">{track.artist}</p>
                  </div>
                </div>

                {/* Duration & Delete */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-[var(--dim)]">
                    {track.duration ? fmtTime(track.duration) : ""}
                  </span>

                  {tracks.length > 1 && (
                    <button
                      onClick={() => onRemoveTrack(idx)}
                      title="Remove from queue"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--dim)] hover:text-rose-400 hover:bg-white/10 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Save Queue as Playlist Modal */}
      <AnimatePresence>
        {saveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSaveModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md glass p-6 rounded-3xl border border-white/20 shadow-2xl space-y-4"
            >
              <h2 className="font-display text-[18px] font-bold text-[var(--ink)]">Save Queue as Playlist</h2>
              <form onSubmit={handleSaveSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--dim)] uppercase mb-1">
                    Playlist Name
                  </label>
                  <input
                    type="text"
                    required
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    placeholder="e.g. My Custom Queue Mix"
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2 text-[14px] text-[var(--ink)] focus:outline-none focus:border-[var(--acc0)]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveModalOpen(false)}
                    className="px-4 py-2 rounded-full text-[12px] text-[var(--dim)] hover:text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full font-bold text-[12px] text-black shadow-md"
                    style={{ background: "var(--acc0)" }}
                  >
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
