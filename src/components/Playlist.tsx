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
      <div className="mb-3 flex shrink-0 items-baseline justify-between px-1">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-[var(--ink)]">Queue</h3>
        <div className="flex items-center gap-2">
          <span className="font-tmono text-[10px] uppercase tracking-[0.16em] text-[var(--dim)]">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </span>
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setOpenInput((o) => !o)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-tmono text-[9px] uppercase tracking-[0.14em] text-black shadow-sm"
            style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
            aria-label="Add song link"
          >
            <PlusIcon size={12} /> add link
          </motion.button>
        </div>
      </div>

      {/* magic shuffle + similar row */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => player.setShuffle(magic ? "off" : "magic")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border py-2 font-tmono text-[9px] uppercase tracking-[0.14em] transition-all"
          style={{
            borderColor: magic ? "var(--acc2)" : "rgba(255,255,255,0.12)",
            background: magic ? "color-mix(in srgb, var(--acc2) 14%, transparent)" : "rgba(255,255,255,0.03)",
            color: magic ? "var(--acc2)" : "var(--dim)",
          }}
          aria-pressed={magic}
          title={magic ? "Magic shuffle auto-plays songs pulled from YouTube" : "Turn on to auto-discover & play similar songs"}
        >
          <SparkIcon size={12} /> magic {magic ? "on" : "off"}
        </button>
        <button
          onClick={onFindSimilar}
          disabled={similarBusy || !current}
          className="flex items-center justify-center gap-1.5 rounded-full border border-white/12 bg-white/3 px-3.5 py-2 font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)] transition-colors hover:border-[var(--acc0)]/50 hover:text-[var(--acc0)] disabled:opacity-50"
          title="Search YouTube for similar songs now"
        >
          <LinkIcon size={12} />
          {similarBusy ? "searching…" : "similar"}
        </button>
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
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Paste YouTube or Spotify link..."
                className="flex-1 rounded-xl border border-white/12 bg-black/40 px-3.5 py-2 font-tmono text-[11px] text-[var(--ink)] placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
              />
              <button
                onClick={submit}
                disabled={busy || !draft.trim()}
                className="rounded-xl px-4 py-2 font-tmono text-[10px] uppercase tracking-[0.12em] text-black font-semibold disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
              >
                {busy ? "adding…" : "queue"}
              </button>
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
                {active && (
                  <motion.span
                    layoutId="queue-active-glow"
                    className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--acc0)] shadow-[0_0_10px_var(--acc0)]"
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
                    active ? "ring-[var(--acc0)]/50 shadow-[0_0_14px_-4px_var(--acc0)]" : "ring-white/8"
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
