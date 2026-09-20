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
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
          isActive ? "font-bold text-[var(--acc0)]" : "text-[var(--dim)] hover:text-white"
        }`}
      >
        <div className="relative">
          {icon}
          {liveIndicator && (
            <span className="live-dot absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-[#4ade80]" />
          )}
          {badge !== undefined && badge > 0 && (
            <span
              className="absolute -right-2.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 font-tmono text-[8px] font-bold text-black"
              style={{ background: "var(--acc0)" }}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          {isActive && (
            <span
              className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full shadow-sm"
              style={{ background: "var(--acc0)" }}
            />
          )}
        </div>
        <span className="font-display text-[9px] uppercase tracking-wider">{label}</span>
      </button>
    );
  };

  return (
    <nav
      className="sticky bottom-0 z-40 flex h-15 shrink-0 items-center justify-around border-t border-white/10 bg-black/70 px-1 backdrop-blur-2xl"
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
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 ${
          isMoreGroup ? "font-bold text-[var(--acc0)]" : "text-[var(--dim)] hover:text-white"
        }`}
      >
        <div className="relative flex h-[18px] items-center justify-center gap-0.5">
          <span className="h-1 w-1 rounded-full bg-current" />
          <span className="h-1 w-1 rounded-full bg-current" />
          <span className="h-1 w-1 rounded-full bg-current" />
          {isMoreGroup && (
            <span
              className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full shadow-sm"
              style={{ background: "var(--acc0)" }}
            />
          )}
        </div>
        <span className="font-display text-[9px] uppercase tracking-wider">More</span>
      </button>
    </nav>
  );
}
