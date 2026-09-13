import { useState } from "react";
import { motion } from "motion/react";
import type { Track } from "../lib/trackModel";
import { PlayIcon } from "./Icons";
import { FolderMusicIcon, ClockOnlyIcon, DownloadIcon } from "./UiIcons";
import { cn } from "../utils/cn";

interface LandingPageProps {
  onOpenPlayer: () => void;
  onExploreRooms: () => void;
  onExplorePlaylists: () => void;
  onOpenAbout: () => void;
  currentTrack?: Track;
  isPlaying: boolean;
  onTogglePlay: () => void;
  skipLanding: boolean;
  onToggleSkipLanding: (val: boolean) => void;
  onlineCount: number;
}

export function LandingPage({
  onOpenPlayer,
  onExploreRooms,
  onExplorePlaylists,
  onOpenAbout,
  currentTrack,
  isPlaying,
  onTogglePlay,
  skipLanding,
  onToggleSkipLanding,
  onlineCount,
}: LandingPageProps) {
  const [quickCode, setQuickCode] = useState("");

  const handleRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickCode.trim()) {
      window.location.href = `/?room=${quickCode.trim().toUpperCase()}`;
    }
  };

  return (
    <div className="relative z-20 min-h-[100dvh] w-full flex flex-col items-center justify-between px-4 py-8 md:py-12 overflow-y-auto no-scrollbar">
      {/* Top Header Badge */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between w-full max-w-5xl"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--acc0)] shadow-[0_0_10px_var(--acc0)]" />
          <span className="font-display font-bold tracking-wider text-[13.5px] text-[var(--ink)] uppercase">
            CREEP CREEP <span className="opacity-40 font-normal">/ By CREESPY</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11.5px] font-medium text-[var(--dim)]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{onlineCount} Online</span>
          </span>
        </div>
      </motion.header>

      {/* Main Hero Centerpiece */}
      <div className="my-auto flex flex-col items-center text-center max-w-3xl w-full py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-4 inline-flex items-center gap-2 px-4 py-1 rounded-full glass-soft text-[11.5px] font-semibold text-[var(--dim)] border border-white/10"
        >
          <span className="text-[var(--acc0)]">✦</span>
          <span>Minimalist Realtime Web Music Experience</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="font-display text-[40px] sm:text-[56px] md:text-[68px] font-extrabold tracking-tight leading-[1.08] text-[var(--ink)]"
        >
          Pure Music.{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(135deg, var(--ink) 40%, var(--acc0) 100%)`,
            }}
          >
            Zero Clutter.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-4 text-[14px] sm:text-[16px] text-[var(--dim)] max-w-xl font-normal leading-relaxed"
        >
          A calm audio space featuring synced Supabase Realtime rooms, custom public & private playlists, YouTube/Spotify imports, and mechanical time tools.
        </motion.p>

        {/* Primary Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto"
        >
          <motion.button
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={onOpenPlayer}
            className="px-7 py-3 rounded-full font-display text-[14.5px] font-bold text-black shadow-xl transition-all flex items-center gap-2"
            style={{
              background: "var(--acc0)",
              boxShadow: "0 6px 24px color-mix(in srgb, var(--acc0) 40%, transparent)",
            }}
          >
            <span>Open Player</span>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </motion.button>

          <button
            onClick={onExploreRooms}
            className="px-5 py-3 rounded-full glass-soft border border-white/15 text-[13.5px] font-semibold text-[var(--ink)] hover:bg-white/10 transition-colors"
          >
            Explore Public Rooms
          </button>

          <button
            onClick={onExplorePlaylists}
            className="px-5 py-3 rounded-full glass-soft border border-white/15 text-[13.5px] font-semibold text-[var(--ink)] hover:bg-white/10 transition-colors"
          >
            Playlists Hub
          </button>
        </motion.div>

        {/* Quick Room Code Join */}
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          onSubmit={handleRoomSubmit}
          className="mt-4 flex items-center justify-center"
        >
          <div className="glass-soft flex items-center p-1 rounded-full border border-white/10 shadow-md">
            <input
              type="text"
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value.toUpperCase())}
              placeholder="Join Room by Code..."
              maxLength={6}
              className="bg-transparent px-3.5 py-1.5 text-[12.5px] font-mono text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:outline-none w-36 sm:w-44"
            />
            <button
              type="submit"
              disabled={!quickCode.trim()}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[11.5px] font-bold text-[var(--ink)] transition-colors disabled:opacity-30"
            >
              Join
            </button>
          </div>
        </motion.form>

        {/* Live Track Floating Pill Preview */}
        {currentTrack && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-6 glass-soft flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 shadow-md max-w-sm"
          >
            <img
              src={currentTrack.thumb}
              alt={currentTrack.title}
              className={cn("h-7 w-7 rounded-full object-cover ring-1 ring-white/20", isPlaying ? "disc-spin disc-spin-on" : "")}
            />
            <div className="min-w-0 text-left flex-1">
              <p className="truncate text-[11.5px] font-semibold text-[var(--ink)]">{currentTrack.title}</p>
              <p className="truncate text-[10px] text-[var(--dim)]">{currentTrack.artist}</p>
            </div>
            <button
              onClick={onTogglePlay}
              className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[var(--ink)] hover:bg-white/25 transition-colors"
            >
              <PlayIcon size={10} className={isPlaying ? "opacity-70" : "ml-0.5"} />
            </button>
          </motion.div>
        )}
      </div>

      {/* Feature Highlights Grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45 }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 w-full max-w-5xl"
      >
        <div className="glass-soft p-4 rounded-2xl border border-white/5 text-left">
          <div className="text-[17px] mb-1.5">⚡</div>
          <h2 className="text-[12.5px] font-bold text-[var(--ink)]">Supabase Realtime Rooms</h2>
          <p className="text-[11px] text-[var(--dim)] mt-0.5">Invite friends to listen in perfect timestamp sync with chat.</p>
        </div>

        <div className="glass-soft p-4 rounded-2xl border border-white/5 text-left">
          <div className="mb-1.5 text-[var(--acc0)]"><FolderMusicIcon size={20} /></div>
          <h2 className="text-[12.5px] font-bold text-[var(--ink)]">Public & Private Playlists</h2>
          <p className="text-[11px] text-[var(--dim)] mt-0.5">Create personal vaults or share public listening mixes.</p>
        </div>

        <div className="glass-soft p-4 rounded-2xl border border-white/5 text-left">
          <div className="mb-1.5 text-[var(--acc0)]"><ClockOnlyIcon size={20} /></div>
          <h2 className="text-[12.5px] font-bold text-[var(--ink)]">Mechanical Time Studio</h2>
          <p className="text-[11px] text-[var(--dim)] mt-0.5">Sliding digit-flipper clock, Pomodoro timer, and weather.</p>
        </div>

        <div className="glass-soft p-4 rounded-2xl border border-white/5 text-left">
          <div className="mb-1.5 text-[var(--acc0)]"><DownloadIcon size={20} /></div>
          <h2 className="text-[12.5px] font-bold text-[var(--ink)]">Total State Memory</h2>
          <p className="text-[11px] text-[var(--dim)] mt-0.5">Remembers song, exact position, volume, and theme across reloads.</p>
        </div>
      </motion.div>

      {/* Footer Preferences */}
      <footer className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-2 w-full max-w-5xl text-[11px] text-[var(--dim)]">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skipLanding}
            onChange={(e) => onToggleSkipLanding(e.target.checked)}
            className="rounded border-white/20 bg-transparent text-[var(--acc0)] focus:ring-0"
          />
          <span>Remember choice: Skip landing and jump directly to player</span>
        </label>

        <button onClick={onOpenAbout} className="hover:text-[var(--ink)] transition-colors">
          About & Usage Guide →
        </button>
      </footer>
    </div>
  );
}
