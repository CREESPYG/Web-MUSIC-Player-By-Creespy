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
  PaletteIcon,
  LyricsIcon,
} from "./UiIcons";
import { cn } from "../utils/cn";

export type ViewMode = "full" | "time";

interface Props {
  theme: Theme;
  customAccent?: string | null;
  onTheme: (id: string) => void;
  onCustomAccent?: (hex: string) => void;
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
  lyricsOpen?: boolean;
  onToggleLyrics?: () => void;
}

const VIEWS: { v: ViewMode; label: string; Icon: typeof LayoutIcon }[] = [
  { v: "full", label: "Split layout", Icon: LayoutIcon },
  { v: "time", label: "Time screen", Icon: ClockOnlyIcon },
];

export function TopBar({
  theme,
  customAccent,
  onTheme,
  onCustomAccent,
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
  lyricsOpen,
  onToggleLyrics,
}: Props) {
  // Check if a custom accent is currently active (distinct from the active base theme's primary color)
  const isCustom = Boolean(
    customAccent &&
    !THEMES.some((t) => t.acc0.toLowerCase() === customAccent.toLowerCase())
  );
  const effectiveCustomHex = customAccent || theme.acc0;

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
                view === v ? "text-[#0d151c] font-medium" : "text-[var(--dim)] hover:text-[var(--ink)]"
              )}
              style={view === v ? { backgroundColor: "var(--acc0)" } : undefined}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        {/* Lyrics quick toggle */}
        {onToggleLyrics && (
          <button
            onClick={onToggleLyrics}
            title={lyricsOpen ? "Switch to Disc View" : "Synchronized Lyrics (LRCLIB)"}
            aria-label="Toggle Lyrics"
            aria-pressed={lyricsOpen}
            className={cn(
              "glass grid h-8 w-8 place-items-center rounded-full transition-all",
              lyricsOpen
                ? "bg-[var(--acc0)] text-[#0d151c] font-bold shadow-sm"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            )}
          >
            <LyricsIcon size={15} />
          </button>
        )}

        {/* Unified Accent Themes & Custom Color Picker */}
        <div
          className="glass hidden items-center gap-2 rounded-full p-1.5 md:flex"
          role="radiogroup"
          aria-label="Accent Themes and Custom Color"
        >
          {THEMES.map((t) => {
            const isPresetActive = !isCustom && t.id === theme.id;
            return (
              <motion.button
                key={t.id}
                whileHover={{ scale: 1.16 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onTheme(t.id)}
                title={`${t.name} Theme — ${t.tagline}`}
                aria-label={`${t.name} theme`}
                className="relative grid h-7 w-7 place-items-center rounded-full transition-transform"
                style={{ background: `linear-gradient(135deg, ${t.acc0}, ${t.acc2})` }}
              >
                {isPresetActive && (
                  <motion.span
                    layoutId="theme-ring"
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className="absolute -inset-[3.5px] rounded-full border-2 border-white/85 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                  />
                )}
              </motion.button>
            );
          })}

          {/* Micro separator between preset themes and custom accent */}
          <span className="h-3.5 w-px bg-white/15 mx-0.5" />

          {/* Custom Accent Color Swatch / Button */}
          <motion.button
            whileHover={{ scale: 1.16 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (isCustom) {
                // If custom color is already active, open Customize drawer to adjust it
                onCustomize();
              } else if (customAccent) {
                // Reactivate existing custom accent
                onCustomAccent?.(customAccent);
              } else {
                // Open Customize drawer so user can pick their custom color
                onCustomize();
              }
            }}
            title={
              isCustom
                ? `Custom Accent: ${effectiveCustomHex} (Click to customize)`
                : "Custom Accent Studio — Click to customize"
            }
            aria-label="Custom Accent Color"
            className={cn(
              "relative grid h-7 w-7 place-items-center rounded-full transition-all",
              isCustom
                ? "shadow-sm"
                : "border border-dashed border-white/30 hover:border-white/60 bg-white/5"
            )}
            style={
              isCustom
                ? {
                    background: `linear-gradient(135deg, ${effectiveCustomHex}, color-mix(in srgb, ${effectiveCustomHex} 45%, white))`,
                  }
                : undefined
            }
          >
            {isCustom ? (
              <>
                <motion.span
                  layoutId="theme-ring"
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="absolute -inset-[3.5px] rounded-full border-2 border-white/90 shadow-sm"
                />
                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />
              </>
            ) : (
              <PaletteIcon size={13} className="text-[var(--dim)] hover:text-white" />
            )}
          </motion.button>
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
