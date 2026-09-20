import type { MobileTab } from "../../hooks/useMobileNavigation";
import { FolderMusicIcon, ListMusicIcon, GroupIcon, HeadphonesIcon } from "../UiIcons";

interface Props {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  onOpenMore: () => void;
  moreOpen: boolean;
  inRoom: boolean;
  queueCount: number;
}

import { cn } from "../../utils/cn";

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  onOpenMore,
  moreOpen,
  inRoom,
  queueCount,
}: Props) {
  const isMoreGroup = moreOpen || activeTab === "clock" || activeTab === "customization";

  const TabBtn = ({
    id,
    icon,
    label,
    badge,
    liveIndicator,
  }: {
    id: MobileTab;
    icon: React.ReactNode;
    label: string;
    badge?: number;
    liveIndicator?: boolean;
  }) => {
    const isActive = activeTab === id;
    return (
      <button
        type="button"
        onClick={() => onSelectTab(id)}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95"
      >
        <div
          className={cn(
            "relative flex items-center justify-center w-12 h-7 rounded-full transition-colors",
            isActive ? "bg-[var(--acc0)]/20 text-[var(--acc0)] font-bold" : "text-[var(--dim)] hover:text-white"
          )}
        >
          {icon}
          {liveIndicator && (
            <span className="live-dot absolute top-1 right-2 h-2 w-2 rounded-full bg-[#4ade80]" />
          )}
          {badge !== undefined && badge > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 font-tmono text-[8px] font-bold text-[#0d151c]"
              style={{ backgroundColor: "var(--acc0)" }}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-display text-[9.5px] uppercase tracking-wider transition-colors",
            isActive ? "font-bold text-[var(--acc0)]" : "text-[var(--dim)]"
          )}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="sticky bottom-0 z-40 flex h-16 shrink-0 items-center justify-around border-t border-white/8 bg-[var(--bg1,#161e28)] px-1 select-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <TabBtn id="player" icon={<HeadphonesIcon size={18} />} label="Music" />
      <TabBtn id="playlist" icon={<FolderMusicIcon size={18} />} label="Library" />
      <TabBtn
        id="room"
        icon={<GroupIcon size={18} />}
        label="Room"
        liveIndicator={inRoom}
      />
      <TabBtn
        id="queue"
        icon={<ListMusicIcon size={18} />}
        label="Queue"
        badge={queueCount}
      />

      {/* More button */}
      <button
        type="button"
        onClick={onOpenMore}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95"
      >
        <div
          className={cn(
            "relative flex items-center justify-center w-12 h-7 rounded-full transition-colors",
            isMoreGroup ? "bg-[var(--acc0)]/20 text-[var(--acc0)] font-bold" : "text-[var(--dim)] hover:text-white"
          )}
        >
          <div className="flex items-center justify-center gap-0.5">
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
          </div>
        </div>
        <span
          className={cn(
            "font-display text-[9.5px] uppercase tracking-wider transition-colors",
            isMoreGroup ? "font-bold text-[var(--acc0)]" : "text-[var(--dim)]"
          )}
        >
          More
        </span>
      </button>
    </nav>
  );
}
