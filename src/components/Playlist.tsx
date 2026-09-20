import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Track } from "../lib/media";
import { similarity } from "../lib/media";
import type { PlayerApi } from "../hooks/usePlayer";
import { fmtTime } from "../lib/color";
import { cn } from "../utils/cn";
import { PlayIcon } from "./Icons";
import { LinkIcon, PlusIcon, SparkIcon, TrashIcon } from "./UiIcons";

export function Playlist({
  tracks,
  player,
  onAdd,
  onRemove,
  busy,
  error,
  onFindSimilar,
  similarBusy,
  similarLive: _similarLive,
  onReorder,
}: {
  tracks: Track[];
  player: PlayerApi;
  onAdd: (url: string) => void;
  onRemove: (i: number) => void;
  busy: boolean;
  error: string | null;
  onFindSimilar: () => void;
  similarBusy: boolean;
  similarLive: boolean | null;
  onReorder?: (from: number, to: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [openInput, setOpenInput] = useState(false);
  const current = tracks[player.index];
  const magic = player.shuffleMode === "magic";

  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  };

  const handleMoveUp = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (i > 0 && onReorder) onReorder(i, i - 1);
  };

  const handleMoveDown = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (i < tracks.length - 1 && onReorder) onReorder(i, i + 1);
  };

  return (
    <div className="glass flex min-h-0 flex-1 flex-col p-3.5 md:p-5 rounded-[var(--radius)]">
      <div className="mb-3 flex shrink-0 items-center justify-between px-1">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-[var(--ink)]">Queue</h3>
        <div className="flex items-center gap-2">
          <span className="font-tmono text-[10px] uppercase tracking-[0.16em] text-[var(--dim)]">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </span>
          <md-filled-button
            onClick={() => setOpenInput((o) => !o)}
            aria-label="Add song link"
            style={{ "--md-filled-button-container-height": "32px", "--md-filled-button-label-text-size": "11px" } as any}
          >
            <span slot="icon"><PlusIcon size={14} /></span>
            Add link
          </md-filled-button>
        </div>
      </div>

      {/* magic shuffle + similar row */}
      <div className="mb-3 flex items-center gap-2">
        <md-filter-chip
          selected={magic}
          onClick={() => player.setShuffle(magic ? "off" : "magic")}
          label={magic ? "Magic on" : "Magic off"}
          title={magic ? "Magic shuffle auto-plays songs pulled from YouTube" : "Turn on to auto-discover & play similar songs"}
          style={{ "--md-filter-chip-container-height": "32px", "--md-filter-chip-label-text-size": "11px", flex: "1" } as any}
        >
          <span slot="icon"><SparkIcon size={14} /></span>
        </md-filter-chip>

        <md-assist-chip
          disabled={similarBusy || !current}
          onClick={onFindSimilar}
          label={similarBusy ? "Searching…" : "Similar songs"}
          title="Search YouTube for similar songs now"
          style={{ "--md-assist-chip-container-height": "32px", "--md-assist-chip-label-text-size": "11px" } as any}
        >
          <span slot="icon"><LinkIcon size={14} /></span>
        </md-assist-chip>
      </div>

      {/* paste-a-link row */}
      <AnimatePresence initial={false}>
        {openInput && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginBottom: 0 }}
            animate={{ height: "auto", opacity: 1, marginBottom: 12 }}
            exit={{ height: 0, opacity: 0, marginBottom: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Paste YouTube or Spotify link..."
                className="flex-1 rounded-xl border border-white/12 bg-black/40 px-3.5 py-2 font-tmono text-[11px] text-[var(--ink)] placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
              />
              <md-filled-button
                disabled={busy || !draft.trim()}
                onClick={submit}
                style={{ "--md-filled-button-container-height": "36px", "--md-filled-button-label-text-size": "11px" } as any}
              >
                {busy ? "adding…" : "queue"}
              </md-filled-button>
            </div>
            {error && <p className="mt-1 px-1 font-tmono text-[9px] text-[#ff9aa6]">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Track list with order management */}
      <ul className="scroll-slim flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {tracks.map((t, i) => {
          const active = i === player.index;
          const dur = player.durations[t.id] ?? t.duration;
          const match = current && !active ? Math.round(similarity(current, t) * 100) : 0;
          return (
            <li key={t.id || `trk-${i}`} className="group relative">
              <motion.button
                layout
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => player.select(i)}
                className={cn(
                  "relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-s)] p-2.5 text-left transition-colors",
                  active ? "border border-[var(--acc0)]/35 bg-white/8" : "border border-transparent hover:bg-white/5"
                )}
              >
                <md-ripple></md-ripple>
                {active && (
                  <motion.span
                    layoutId="queue-active-glow"
                    className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--acc0)]"
                  />
                )}

                <span className="relative w-5 shrink-0 text-center font-tmono text-[11px] text-[var(--dim)]">
                  {active ? (
                    <span className="flex h-4 items-end justify-center gap-[2.5px]">
                      {[0, 1, 2].map((b) => (
                        <span
                          key={b}
                          className="eq-bar w-[3px] rounded-full bg-[var(--acc0)]"
                          style={{
                            height: "100%",
                            animationDelay: `${b * 0.16}s`,
                            animationPlayState: player.playing ? "running" : "paused",
                          }}
                        />
                      ))}
                    </span>
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>

                <span
                  className={cn(
                    "relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-xl ring-1 transition-shadow",
                    active ? "ring-[var(--acc0)]/60 shadow-sm" : "ring-white/8"
                  )}
                >
                  <img src={t.thumb} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" />
                  <span
                    className={cn(
                      "absolute inset-0 grid place-items-center bg-black/50 text-white transition-opacity",
                      active ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <PlayIcon size={16} />
                  </span>
                </span>

                <span className="min-w-0 flex-1 pr-14">
                  <span className={cn("block truncate text-[13.5px] font-semibold", active ? "text-[var(--acc0)]" : "text-[var(--ink)]")}>
                    {t.title}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-xs font-medium text-[var(--dim)]">{t.artist}</span>
                    {magic && match > 55 && (
                      <span className="shrink-0 rounded-full border border-[var(--acc2)]/35 px-1.5 font-tmono text-[7.5px] uppercase tracking-[0.1em] text-[var(--acc2)]">
                        {match}% match
                      </span>
                    )}
                    {t.source === "similar" && (
                      <span className="shrink-0 rounded-full border border-[var(--acc1)]/35 px-1.5 font-tmono text-[7.5px] uppercase tracking-[0.1em] text-[var(--acc1)]">
                        similar
                      </span>
                    )}
                  </span>
                </span>

                <span className="shrink-0 font-tmono text-[11px] tabular-nums text-[var(--dim)]">
                  {dur ? fmtTime(dur) : "––:––"}
                </span>
              </motion.button>

              {/* Host / User Management Controls: Move Up, Move Down, Remove */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 z-10 bg-[#070e1b]/80 backdrop-blur-sm rounded-lg p-1 border border-white/10">
                {onReorder && i > 0 && (
                  <button
                    onClick={(e) => handleMoveUp(i, e)}
                    title="Move up in queue"
                    className="grid h-6 w-6 place-items-center rounded text-[var(--dim)] hover:bg-white/10 hover:text-white text-[10px]"
                  >
                    ▲
                  </button>
                )}
                {onReorder && i < tracks.length - 1 && (
                  <button
                    onClick={(e) => handleMoveDown(i, e)}
                    title="Move down in queue"
                    className="grid h-6 w-6 place-items-center rounded text-[var(--dim)] hover:bg-white/10 hover:text-white text-[10px]"
                  >
                    ▼
                  </button>
                )}
                {tracks.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    title="Remove from queue"
                    className="grid h-6 w-6 place-items-center rounded text-[var(--dim)] hover:bg-white/10 hover:text-[#ff9aa6]"
                  >
                    <TrashIcon size={12} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
