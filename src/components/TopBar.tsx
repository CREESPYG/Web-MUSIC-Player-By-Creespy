import { motion } from "motion/react";
import type { PresenceMode } from "../hooks/usePresence";
import { LogoIcon } from "./Icons";
import {
  SlidersIcon,
  LayoutIcon,
  ClockOnlyIcon,
  HeadphonesIcon,
  FolderMusicIcon,
  SearchIcon,
  HistoryIcon,
  DiscIcon,
} from "./UiIcons";
import { cn } from "../utils/cn";
import { SCREEN_TABS, type ScreenId } from "../lib/screens";

export type ViewMode = "full" | "time";

interface Props {
  online: number;
  mode: PresenceMode;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  screen: ScreenId;
  onScreen: (s: ScreenId) => void;
  roomActive: boolean;
  roomCount: number;
}

const SCREEN_ICONS: Record<ScreenId, typeof LayoutIcon> = {
  player: DiscIcon,
  library: FolderMusicIcon,
  rooms: HeadphonesIcon,
  history: HistoryIcon,
  settings: SlidersIcon,
  search: SearchIcon,
};

const VIEWS: { v: ViewMode; label: string; Icon: typeof LayoutIcon }[] = [
  { v: "full", label: "Split layout", Icon: LayoutIcon },
  { v: "time", label: "Time screen", Icon: ClockOnlyIcon },
];

export function TopBar({
  online,
  mode,
  view,
  onView,
  screen,
  onScreen,
  roomActive,
  roomCount,
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

        {/* Screen navigation — every feature is a full screen, no sidebars */}
        <nav className="glass flex items-center gap-1 rounded-full p-1" aria-label="Screens">
          {SCREEN_TABS.map(({ id, label }) => {
            const Icon = SCREEN_ICONS[id];
            const active = screen === id;
            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.94 }}
                onClick={() => onScreen(id)}
                title={label}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-2.5 py-2 font-tmono text-[9.5px] uppercase tracking-[0.14em] transition-colors md:px-3",
                  active ? "text-black" : "text-[var(--dim)] hover:text-[var(--ink)]"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="screen-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full"
                    style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  <Icon size={14} />
                  <span className="hidden lg:inline">{label}</span>
                  {id === "rooms" && roomActive && (
                    <span className="flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-px text-[8px] text-black">
                      <span className="live-dot h-1.5 w-1.5 rounded-full bg-black" />
                      {roomCount}
                    </span>
                  )}
                </span>
              </motion.button>
            );
          })}
        </nav>

        {/* Search Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => onScreen("search")}
          className="glass hidden items-center gap-2 rounded-full px-3.5 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.16em] transition-colors hover:text-[var(--acc0)] sm:flex"
          aria-label="Search everything (Ctrl+K)"
          title="Search everything — Ctrl+K"
        >
          <SearchIcon size={15} />
          <span className="hidden sm:inline">search</span>
        </motion.button>
      </div>
    </header>
  );
}
