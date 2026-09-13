import { motion } from "motion/react";
import type { Peer, PresenceMode } from "../hooks/usePresence";
import { UsersIcon } from "./Icons";
import { hexToRgba } from "../lib/color";
import type { Theme } from "../themes";

/** Live users = real, currently-connected sessions only (heartbeat verified). */
export function ListenersCard({
  online,
  peers,
  theme,
  mode,
}: {
  online: number;
  peers: Peer[];
  theme: Theme;
  mode: PresenceMode;
}) {
  const shown = peers.slice(0, 4);

  return (
    <div className="glass relative overflow-hidden p-4 md:p-5">
      <div
        className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full opacity-30 blur-2xl"
        style={{ background: "var(--acc1)" }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="live-dot h-2 w-2 rounded-full bg-[var(--acc0)]" />
            <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
              Online now
            </h3>
          </div>
          <div className="mt-2 flex items-end gap-2.5">
            <motion.span
              key={online}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[34px] font-extrabold leading-none tabular-nums text-[var(--ink)]"
            >
              {online}
            </motion.span>
            <span className="mb-1 font-tmono text-[10px] uppercase tracking-[0.14em] text-[var(--dim)]">
              session{online === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <span className="glass-soft grid h-11 w-11 place-items-center rounded-2xl text-[var(--acc1)]">
          <UsersIcon size={21} />
        </span>
      </div>

      {/* live meter — real session share */}
      <div className="relative mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg,var(--acc0),var(--acc1))", boxShadow: "0 0 10px var(--acc0)" }}
          animate={{ width: `${Math.max(6, Math.min(100, online * 20))}%` }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
        />
      </div>

      {/* real session chips */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center">
          {shown.map((p, i) => {
            const col = `hsl(${p.hue} 85% 62%)`;
            return (
              <motion.span
                key={p.id}
                layout
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                title={p.mine ? "This session" : `Listener ${p.where}`}
                className="-ml-1.5 grid h-6 w-6 place-items-center rounded-full border-2 font-tmono text-[9px] font-bold text-black first:ml-0"
                style={{ background: col, borderColor: hexToRgba(theme.bg0, 0.9), zIndex: 6 - i }}
              >
                {p.mine ? "you" : p.where.replace("tab-", "").slice(0, 2).toUpperCase()}
              </motion.span>
            );
          })}
          {online > shown.length && (
            <span className="-ml-1.5 grid h-6 w-7 place-items-center rounded-full border-2 bg-black/50 font-tmono text-[8.5px] text-[var(--dim)]" style={{ borderColor: hexToRgba(theme.bg0, 0.9) }}>
              +{online - shown.length}
            </span>
          )}
          {online === 0 && (
            <span className="font-tmono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]">connecting…</span>
          )}
        </div>
        <span
          className="ml-auto rounded-full border px-2 py-0.5 font-tmono text-[8.5px] uppercase tracking-[0.16em]"
          style={{
            borderColor: mode === "global" ? "var(--acc0)" : "rgba(255,255,255,0.16)",
            color: mode === "global" ? "var(--acc0)" : "var(--dim)",
          }}
          title={mode === "global" ? "Live across all visitors via Supabase presence" : "Realtime offline — counting this browser's tabs"}
        >
          {mode === "global" ? "supabase live" : mode === "local" ? "this browser" : "connecting"}
        </span>
      </div>
    </div>
  );
}
