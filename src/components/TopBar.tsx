import { motion } from "motion/react";
import { THEMES, type Theme } from "../themes";
import type { PresenceMode } from "../hooks/usePresence";
import { LogoIcon } from "./Icons";
import {
  SlidersIcon,
  LayoutIcon,
  ClockOnlyIcon,
  HeadphonesIcon,
  FolderMusicIcon,
} from "./UiIcons";
import { cn } from "../utils/cn";

export type ViewMode = "full" | "time";

interface Props {
  theme: Theme;
  onTheme: (id: string) => void;
  online: number;
  onCustomize: () => void;
  customizeOpen: boolean;
  mode: PresenceMode;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  onRoom: () => void;
  roomActive: boolean;
  roomCount: number;
  onPlaylists?: () => void;
  playlistsOpen?: boolean;
}

const VIEWS: { v: ViewMode; label: string; Icon: typeof LayoutIcon }[] = [
  { v: "full", label: "Split layout", Icon: LayoutIcon },
  { v: "time", label: "Time screen", Icon: ClockOnlyIcon },
];

export function TopBar({
  theme,
  onTheme,
  online,
  onCustomize,
  customizeOpen,
  mode,
  view,
  onView,
  onRoom,
  roomActive,
  roomCount,
  onPlaylists,
  playlistsOpen,
}: Props) {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1440px] shrink-0 items-center justify-between gap-3 px-3 py-2.5 md:px-6 md:py-3.5">
      {/* Brand Logo */}
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10"
          style={{
            background:
              "linear-gradient(150deg, color-mix(in srgb, var(--acc0) 18%, transparent), rgba(255,255,255,0.03))",
          }}
        >
          <LogoIcon size={25} />
        </span>
        <div>
          <h1 className="font-display text-[17px] font-extrabold leading-none tracking-[0.2em] text-[var(--ink)]">
            CREEP CREEP
          </h1>
          <p className="mt-1.5 font-tmono text-[8px] uppercase tracking-[0.32em] text-[var(--dim)]">
            Music Player By CREESPY
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Real online sessions */}
        <div
          className="glass hidden items-center gap-2 rounded-full px-3 py-2 sm:flex"
          title={mode === "global" ? "Live across all visitors via Supabase presence" : "Counting this browser's open tabs"}
        >
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--acc0)]" />
          <span className="font-display text-[13px] font-bold tabular-nums text-[var(--ink)]">{online}</span>
          <span className="font-tmono text-[8.5px] uppercase tracking-[0.18em] text-[var(--dim)]">
            {mode === "connecting" ? "…" : "online"}
          </span>
        </div>

        {/* View mode switcher */}
        <div className="glass flex items-center gap-1 rounded-full p-1" role="radiogroup" aria-label="View mode">
          {VIEWS.map(({ v, label, Icon }) => (
            <button
              key={v}
              onClick={() => onView(v)}
              title={label}
              aria-label={label}
              aria-checked={view === v}
              role="radio"
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full transition-colors",
                view === v ? "text-black" : "text-[var(--dim)] hover:text-[var(--ink)]"
              )}
              style={view === v ? { background: "linear-gradient(135deg,var(--acc0),var(--acc1))" } : undefined}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        {/* Accent Themes */}
        <div className="glass hidden items-center gap-2.5 rounded-full p-2 md:flex" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.18 }}
              whileTap={{ scale: 0.88 }}
              onClick={() => onTheme(t.id)}
              title={`${t.name} — ${t.tagline}`}
              aria-label={`${t.name} theme`}
              className="relative grid h-7 w-7 place-items-center rounded-full"
              style={{ background: `linear-gradient(135deg, ${t.acc0}, ${t.acc2})` }}
            >
              {t.id === theme.id && (
                <motion.span
                  layoutId="theme-ring"
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="absolute -inset-[3.5px] rounded-full border-2 border-white/80"
                />
              )}
            </motion.button>
          ))}
        </div>

        {/* Playlists Hub Button */}
        {onPlaylists && (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            onClick={onPlaylists}
            className="glass relative flex items-center gap-2 rounded-full px-3.5 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.16em] transition-colors hover:text-[var(--acc0)]"
            style={{ color: playlistsOpen ? "var(--acc0)" : "var(--dim)" }}
            aria-label="Playlists Hub"
          >
            <FolderMusicIcon size={15} />
            <span className="hidden sm:inline">playlists</span>
          </motion.button>
        )}

        {/* Room Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          onClick={onRoom}
          className="glass relative flex items-center gap-2 rounded-full px-3.5 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.16em] transition-colors hover:text-[var(--acc0)]"
          style={{ color: roomActive ? "var(--acc0)" : "var(--dim)" }}
          aria-label="Listen together room"
        >
          <HeadphonesIcon size={15} />
          <span className="hidden sm:inline">room</span>
          {roomActive && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--acc0)]/15 px-1.5 py-0.5 text-[8px] text-[var(--acc0)]">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--acc0)]" />
              {roomCount}
            </span>
          )}
        </motion.button>

        {/* Customize Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          onClick={onCustomize}
          className="glass flex items-center gap-2 rounded-full px-3.5 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.16em] transition-colors hover:text-[var(--acc0)]"
          style={{ color: customizeOpen ? "var(--acc0)" : "var(--dim)" }}
          aria-label="Customize"
        >
          <SlidersIcon size={15} />
          <span className="hidden sm:inline">customize</span>
        </motion.button>
      </div>
    </header>
  );
}
