import React, { useEffect, useRef, useState, useCallback } from "react";
import { animate, stagger } from "animejs";
import type { Track } from "../data/tracks";
import type { Theme } from "../themes";
import { useLyrics } from "../hooks/useLyrics";
import { LyricsIcon, SearchIcon, CloseIcon } from "./UiIcons";
import { cn } from "../utils/cn";

interface Props {
  track: Track | undefined;
  currentTime: number;
  duration: number;
  theme?: Theme;
  onSeek?: (seconds: number) => void;
  onClose?: () => void;
  mode?: "embedded" | "fullscreen";
}

function fmtSec(sec: number): string {
  if (sec < 0 || isNaN(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function LyricsView({
  track,
  currentTime,
  duration,
  onSeek,
  onClose,
  mode = "embedded",
}: Props) {
  const { data, loading, error, activeIndex, reload } = useLyrics(
    track,
    currentTime,
    duration
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [userIsScrolling, setUserIsScrolling] = useState(false);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const prevTrackIdRef = useRef<string>("");

  // Stagger entry animation using anime.js when lines first load or change
  useEffect(() => {
    if (!data?.lines || data.lines.length === 0) return;

    const trackId = track?.id || track?.videoId || "";
    if (prevTrackIdRef.current !== trackId) {
      prevTrackIdRef.current = trackId;

      // Animate line entries
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        const lineElements = scrollRef.current.querySelectorAll(".lyric-line-item");
        if (lineElements.length > 0) {
          animate(lineElements, {
            opacity: [0, 0.35],
            translateY: [18, 0],
            delay: stagger(16, { start: 50 }),
            duration: 450,
            ease: "outCubic",
          });
        }
      });
    }
  }, [data, track?.id, track?.videoId]);

  // Smooth centering of active line using anime.js
  useEffect(() => {
    if (userIsScrolling || activeIndex < 0 || !scrollRef.current) return;

    const container = scrollRef.current;
    const activeEl = container.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement | null;
    if (!activeEl) return;

    const containerHeight = container.clientHeight;
    const targetScroll = activeEl.offsetTop - containerHeight / 2 + activeEl.clientHeight / 2;

    // Use animejs for fluid cubic-bezier scrolling
    animate(container, {
      scrollTop: Math.max(0, targetScroll),
      duration: 650,
      ease: "cubicBezier(0.25, 1, 0.5, 1)",
    });

    // Subtle scale feedback on active line
    animate(activeEl, {
      scale: [1, 1.025, 1.015],
      duration: 350,
      ease: "outQuad",
    });
  }, [activeIndex, userIsScrolling]);

  // Handle manual scroll: temporarily pause auto-scroll
  const handleWheelOrTouch = useCallback(() => {
    setUserIsScrolling(true);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      setUserIsScrolling(false);
    }, 4000);
  }, []);

  const resumeAutoScroll = () => {
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    setUserIsScrolling(false);
  };

  const handleLineClick = (time: number, index: number) => {
    if (time >= 0 && onSeek) {
      onSeek(time);
      resumeAutoScroll();

      // Click ripple feedback via anime.js
      if (scrollRef.current) {
        const el = scrollRef.current.querySelector(`[data-index="${index}"]`);
        if (el) {
          animate(el, {
            scale: [0.97, 1.03, 1],
            duration: 300,
            ease: "outElastic(1, .8)",
          });
        }
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      reload(inputVal.trim());
      setShowSearch(false);
    }
  };

  const isFullscreen = mode === "fullscreen";

  return (
    <div
      className={cn(
        "relative flex flex-col select-none overflow-hidden transition-all duration-300",
        isFullscreen
          ? "fixed inset-0 z-50 bg-[#07090e]/95 backdrop-blur-2xl p-4 sm:p-8"
          : "h-full w-full rounded-2xl glass-panel p-4"
      )}
    >
      {/* Dynamic ambient backdrop glow */}
      <div
        className="pointer-events-none absolute -inset-20 opacity-20 blur-3xl transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle at 50% 40%, var(--acc0) 0%, transparent 60%)`,
        }}
      />

      {/* Top Header Bar */}
      <div className="relative z-10 mb-2 flex items-center justify-between gap-2 border-b border-white/8 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: "rgba(255,255,255,0.06)", color: "var(--acc0)" }}
          >
            <LyricsIcon size={14} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                Lyrics
              </span>
              {data?.isSynced && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-tmono text-[9px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Synced • LRCLIB
                </span>
              )}
              {data && !data.isSynced && !data.instrumental && (
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-tmono text-[9px] font-medium text-[var(--dim)]">
                  Plain Text
                </span>
              )}
              {data?.instrumental && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-tmono text-[9px] font-semibold text-amber-300">
                  Instrumental
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* User scrolled away indicator */}
          {userIsScrolling && data?.isSynced && (
            <button
              onClick={resumeAutoScroll}
              className="flex items-center gap-1 rounded-full bg-[var(--acc0)] px-2.5 py-1 font-tmono text-[10px] font-bold text-black shadow-md transition-transform hover:scale-105 active:scale-95"
            >
              Sync
            </button>
          )}

          {/* Search lyrics toggle */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Search different lyrics"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg text-[var(--dim)] transition-colors hover:bg-white/10 hover:text-white",
              showSearch ? "bg-white/10 text-white" : ""
            )}
          >
            <SearchIcon size={14} />
          </button>

          {/* Close button if provided */}
          {onClose && (
            <button
              onClick={onClose}
              title="Close lyrics"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--dim)] transition-colors hover:bg-white/10 hover:text-white"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search Input Bar Overlay */}
      {showSearch && (
        <form onSubmit={handleSearchSubmit} className="relative z-20 mb-3 flex items-center gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={`Search LRCLIB (e.g. ${track?.artist || ""} ${track?.title || ""})`}
            autoFocus
            className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 font-tmono text-xs text-[var(--ink)] placeholder-[var(--dim)]/50 outline-none focus:border-[var(--acc0)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--acc0)] px-3 py-1.5 font-tmono text-xs font-bold text-black"
          >
            Find
          </button>
        </form>
      )}

      {/* Main Lyrics Body */}
      <div
        ref={scrollRef}
        onWheel={handleWheelOrTouch}
        onTouchMove={handleWheelOrTouch}
        className="scroll-slim relative z-10 flex-1 overflow-y-auto px-1 py-12"
      >
        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[var(--acc0)]" />
            <p className="font-tmono text-xs text-[var(--dim)] animate-pulse">
              Fetching lyrics from LRCLIB...
            </p>
          </div>
        )}

        {!loading && error && !data && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-[var(--dim)]">
              <LyricsIcon size={22} />
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-[var(--ink)]">No Lyrics Found</p>
              <p className="mt-1 font-tmono text-xs text-[var(--dim)]">
                Couldn't find lyrics matching "{track?.title}" on LRCLIB.
              </p>
            </div>
            <button
              onClick={() => {
                setShowSearch(true);
                setInputVal(`${track?.artist || ""} ${track?.title || ""}`.trim());
              }}
              className="mt-1 flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-tmono text-xs text-white transition-colors hover:bg-white/10"
            >
              <SearchIcon size={12} /> Custom Search
            </button>
          </div>
        )}

        {!loading && data?.instrumental && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/5">
              <div className="h-4 w-4 rounded-full bg-[var(--acc0)] animate-ping" />
            </div>
            <p className="font-display text-base font-bold text-[var(--ink)]">Instrumental Track</p>
            <p className="font-tmono text-xs text-[var(--dim)]">Sit back and enjoy the music</p>
          </div>
        )}

        {!loading && data && !data.instrumental && data.lines.length > 0 && (
          <div className="flex flex-col gap-5 text-center sm:text-left sm:px-6">
            {data.lines.map((line, idx) => {
              const isActive = data.isSynced && idx === activeIndex;
              const isPast = data.isSynced && idx < activeIndex;

              return (
                <div
                  key={`${idx}-${line.time}`}
                  data-index={idx}
                  onClick={() => handleLineClick(line.time, idx)}
                  className={cn(
                    "lyric-line-item group relative cursor-pointer select-none rounded-xl py-1.5 px-3 transition-all duration-300 origin-center sm:origin-left",
                    isActive
                      ? "text-[var(--ink)] font-bold scale-[1.02] sm:scale-[1.03]"
                      : isPast
                      ? "text-[var(--ink)]/55 font-medium hover:text-[var(--ink)]/80"
                      : "text-[var(--dim)]/40 font-medium hover:text-[var(--dim)]/80"
                  )}
                >
                  <p
                    className={cn(
                      "font-display tracking-tight transition-all duration-300 leading-snug",
                      isFullscreen
                        ? "text-xl sm:text-3xl md:text-4xl"
                        : "text-base sm:text-lg md:text-xl",
                      isActive
                        ? "drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                        : "blur-[0.2px]"
                    )}
                    style={
                      isActive
                        ? {
                            color: "var(--ink)",
                            textShadow: "0 0 25px var(--acc0)",
                          }
                        : undefined
                    }
                  >
                    {line.text || "•••"}
                  </p>

                  {/* Optional time pill on hover for easy seeking */}
                  {data.isSynced && line.time >= 0 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/50 px-1.5 py-0.5 font-tmono text-[10px] text-[var(--dim)] opacity-0 transition-opacity group-hover:opacity-100">
                      {fmtSec(line.time)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer metadata */}
      {data && (
        <div className="relative z-10 mt-2 flex items-center justify-between border-t border-white/5 pt-2 font-tmono text-[10px] text-[var(--dim)]/60">
          <span>
            {data.trackName} — {data.artistName}
          </span>
          <span>LRCLIB</span>
        </div>
      )}
    </div>
  );
}
