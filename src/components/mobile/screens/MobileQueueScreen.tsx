import { useState } from "react";
import type { Track } from "../../../lib/trackModel";
import type { PlayerApi } from "../../Controls";
import { PlusIcon, TrashIcon, SparkIcon } from "../../UiIcons";

interface Props {
  tracks: Track[];
  player: PlayerApi;
  onAdd: (url: string) => void;
  onRemove: (idx: number) => void;
  onReorder: (from: number, to: number) => void;
  onFindSimilar: () => void;
  similarBusy: boolean;
  onToast: (msg: string) => void;
}

export function MobileQueueScreen({
  tracks,
  player,
  onAdd,
  onRemove,
  onReorder,
  onFindSimilar,
  similarBusy,
  onToast,
}: Props) {
  const [urlDraft, setUrlDraft] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlDraft.trim()) return;
    onAdd(urlDraft.trim());
    setUrlDraft("");
  };

  return (
    <div className="scroll-slim flex h-full flex-col overflow-y-auto px-4 py-3 pb-8">
      {/* 1. Add Track Input Bar */}
      <form onSubmit={handleAdd} className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="Paste YouTube or Spotify song/playlist link…"
          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-body text-xs text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!urlDraft.trim()}
          className="flex items-center gap-1 rounded-xl px-3.5 py-2.5 font-display text-xs font-bold text-black shadow-md transition-transform disabled:opacity-40 active:scale-95"
          style={{ background: "var(--acc0)" }}
        >
          <PlusIcon size={14} />
          <span>Add</span>
        </button>
      </form>

      {/* 2. Queue Status & Auto Top-Up Button */}
      <div className="mb-3 flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2">
        <span className="font-tmono text-[10px] uppercase tracking-wider text-[var(--dim)]">
          Total Queue: <strong className="text-white">{tracks.length}</strong> tracks
        </span>

        <button
          type="button"
          onClick={onFindSimilar}
          disabled={similarBusy}
          className="flex items-center gap-1 rounded-lg border border-[var(--acc0)]/30 bg-[var(--acc0)]/10 px-2.5 py-1 font-display text-[10px] font-bold text-[var(--acc0)] transition-transform active:scale-95 disabled:opacity-50"
        >
          <SparkIcon size={12} />
          <span>{similarBusy ? "Finding…" : "Find Similar"}</span>
        </button>
      </div>

      {/* 3. Reorderable Track List */}
      <div className="flex flex-col gap-1.5">
        {tracks.map((tr, idx) => {
          const isPlaying = idx === player.index;
          const thumb = tr.thumb || `https://i.ytimg.com/vi/${tr.videoId}/hqdefault.jpg`;

          return (
            <div
              key={`${tr.id || tr.videoId}-${idx}`}
              onClick={() => player.select(idx)}
              className={`flex items-center justify-between gap-2.5 rounded-xl border p-2 transition-all active:scale-[0.99] ${
                isPlaying
                  ? "border-[var(--acc0)]/50 bg-[var(--acc0)]/12 shadow-sm"
                  : "border-white/6 bg-white/[0.02] hover:border-white/12"
              }`}
            >
              {/* Order Number / Live Icon */}
              <div className="flex w-6 shrink-0 justify-center">
                {isPlaying ? (
                  <span className="live-dot h-2 w-2 rounded-full bg-[var(--acc0)]" />
                ) : (
                  <span className="font-tmono text-[10px] text-[var(--dim)]/60">
                    {idx + 1}
                  </span>
                )}
              </div>

              {/* Artwork + Details */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`truncate font-display text-xs font-bold ${
                      isPlaying ? "text-[var(--acc0)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {tr.title}
                  </span>
                  <span className="truncate text-[10px] text-[var(--dim)]">
                    {tr.artist || "CREESPY"}
                  </span>
                </div>
              </div>

              {/* Reorder Up/Down & Delete */}
              <div
                className="flex shrink-0 items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Move Up */}
                <button
                  type="button"
                  onClick={() => idx > 0 && onReorder(idx, idx - 1)}
                  disabled={idx === 0}
                  className="grid h-7 w-7 place-items-center rounded text-[var(--dim)] disabled:opacity-20 active:scale-90"
                  aria-label="Move up"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>

                {/* Move Down */}
                <button
                  type="button"
                  onClick={() => idx < tracks.length - 1 && onReorder(idx, idx + 1)}
                  disabled={idx === tracks.length - 1}
                  className="grid h-7 w-7 place-items-center rounded text-[var(--dim)] disabled:opacity-20 active:scale-90"
                  aria-label="Move down"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Remove */}
                {tracks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemove(idx);
                      onToast(`Removed "${tr.title.slice(0, 18)}…"`);
                    }}
                    className="grid h-7 w-7 place-items-center rounded text-[var(--dim)] hover:text-[#ff6b7a] active:scale-90"
                    aria-label="Remove from queue"
                  >
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
