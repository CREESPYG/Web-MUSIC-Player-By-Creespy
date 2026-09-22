import { useSyncExternalStore } from "react";
import { bgImport, bgPercent, type BackgroundImportState } from "../lib/bgImport";

const SOURCE_LABEL: Record<BackgroundImportState["source"], string> = {
  spotify: "Spotify",
  jiosaavn: "JioSaavn",
  soundcloud: "SoundCloud",
  youtube: "YouTube",
  custom: "Custom",
};

export function BackgroundImportWindow() {
  const s = useSyncExternalStore(bgImport.subscribe, bgImport.get, bgImport.get);

  if (!s.active) return null;
  const pct = bgPercent(s);
  const resolving = s.done < s.total && !s.cancelled;

  return (
    <div
      className="fixed bottom-4 right-4 z-[130] w-72 rounded-2xl border border-white/10 bg-[var(--panel)]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-full border border-[var(--acc0)]/30 bg-[var(--acc0)]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--acc0)]">
            {SOURCE_LABEL[s.source]}
          </span>
          <span className="truncate text-[10px] text-[var(--dim)]">
            → {s.targetTitle}
          </span>
        </div>
        {!s.cancelled && (
          <button
            onClick={() => bgImport.cancel()}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-red-400 transition-colors hover:bg-red-500/15"
            disabled={!resolving}
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => bgImport.clear()}
          className="shrink-0 rounded-md px-1 text-[11px] text-[var(--dim)] transition-colors hover:text-white"
          aria-label="Dismiss progress window"
        >
          ✕
        </button>
      </div>

      <p className="mt-2 truncate text-[11px] text-white/90">
        {s.status || (s.cancelled ? "Cancelling…" : "Importing…")}
      </p>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[var(--acc0)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--dim)]">
        <span>
          {s.cancelled
            ? "Cancelling…"
            : resolving
            ? `${s.done}/${s.total} matching`
            : `Complete — ${s.completedCount} added`}
        </span>
        <span className="font-mono">{pct}%</span>
      </div>
    </div>
  );
}
