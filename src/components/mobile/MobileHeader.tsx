import type { MobileTab } from "../../hooks/useMobileNavigation";
import { DownloadIcon } from "../UiIcons";

interface Props {
  activeTab: MobileTab;
  onBack?: () => void;
  inRoom: boolean;
  roomConnected: boolean;
  canInstall: boolean;
  onInstall: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenCustomize: () => void;
}

const TITLES: Record<MobileTab, { title: string; subtitle?: string }> = {
  player: { title: "Now Playing", subtitle: "CREEP CREEP" },
  playlist: { title: "Playlists Hub", subtitle: "Library & Packs" },
  room: { title: "Listen Together", subtitle: "Live Synchronized Audio" },
  queue: { title: "Up Next", subtitle: "Track Queue" },
  clock: { title: "Bedside Clock", subtitle: "Weather & Sleep Timer" },
  customization: { title: "Themes & FX", subtitle: "Personalize Player" },
};

export function MobileHeader({
  activeTab,
  onBack,
  inRoom,
  roomConnected,
  canInstall,
  onInstall,
  isFullscreen,
  onToggleFullscreen,
  onOpenCustomize,
}: Props) {
  const isSubScreen = activeTab === "clock" || activeTab === "customization" || activeTab === "queue";

  const { title, subtitle } = TITLES[activeTab] || { title: "Music Player" };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-black/40 px-3.5 backdrop-blur-xl">
      {/* Left Area */}
      <div className="flex min-w-0 items-center gap-2.5">
        {isSubScreen && onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-[var(--ink)] transition-transform active:scale-95"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
            <span className="font-display text-xs font-black tracking-widest text-[var(--acc0)]">CC</span>
          </div>
        )}

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate font-display text-sm font-bold tracking-tight text-[var(--ink)]">
              {title}
            </h1>
            {inRoom && activeTab === "room" && (
              <span
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 font-tmono text-[7px] uppercase tracking-wider"
                style={{
                  background: roomConnected ? "rgba(74, 222, 128, 0.15)" : "rgba(251, 146, 60, 0.15)",
                  color: roomConnected ? "#4ade80" : "#fb923c",
                }}
              >
                <span
                  className="live-dot h-1 w-1 rounded-full"
                  style={{ background: roomConnected ? "#4ade80" : "#fb923c" }}
                />
                Live
              </span>
            )}
          </div>
          {subtitle && (
            <span className="truncate font-tmono text-[9px] uppercase tracking-widest text-[var(--dim)]/70">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right Area */}
      <div className="flex items-center gap-1.5">
        {canInstall && (
          <button
            type="button"
            onClick={onInstall}
            className="flex items-center gap-1 rounded-full border border-[var(--acc0)]/40 bg-[var(--acc0)]/15 px-2.5 py-1 font-display text-[10px] font-bold text-[var(--acc0)] shadow-sm transition-transform active:scale-95"
            title="Install App on Home Screen"
          >
            <DownloadIcon size={12} />
            <span>Install</span>
          </button>
        )}

        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/8 bg-white/5 text-[var(--dim)] transition-colors hover:text-white active:scale-95"
          aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          )}
        </button>

        {/* Themes Quick-Access */}
        {activeTab !== "customization" && (
          <button
            type="button"
            onClick={onOpenCustomize}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/8 bg-white/5 text-[var(--dim)] transition-colors hover:text-white active:scale-95"
            aria-label="Customize Theme & FX"
          >
            <span className="h-3 w-3 rounded-full border border-white/20 shadow-sm" style={{ background: "var(--acc0)" }} />
          </button>
        )}
      </div>
    </header>
  );
}
