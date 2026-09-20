import { AnimatePresence, motion } from "motion/react";
import type { MobileTab } from "../../hooks/useMobileNavigation";
import {
  ClockOnlyIcon,
  CloseIcon,
  PaletteIcon,
  GroupIcon,
} from "../UiIcons";

interface Props {
  open: boolean;
  onClose: () => void;
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  inRoom: boolean;
  chatCount?: number;
  memberCount?: number;
}

export function MobileMoreSheet({
  open,
  onClose,
  activeTab,
  onSelectTab,
  inRoom,
  chatCount = 0,
  memberCount = 1,
}: Props) {
  const handlePick = (tab: MobileTab) => {
    onSelectTab(tab);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border-t border-white/12 bg-black/80 p-5 shadow-2xl backdrop-blur-2xl"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}
          >
            {/* Sheet Handle */}
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />

            {/* Header */}
            <div className="mb-4 flex items-center justify-between border-b border-white/8 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--ink)]">More Features</h3>
                <p className="font-tmono text-[10px] uppercase tracking-wider text-[var(--dim)]">
                  Quick Navigation & Settings
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-[var(--dim)] transition-colors hover:text-white"
                aria-label="Close menu"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Feature Options Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Bedside Clock */}
              <button
                type="button"
                onClick={() => handlePick("clock")}
                className={`flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
                  activeTab === "clock"
                    ? "border-[var(--acc0)]/60 bg-[var(--acc0)]/15 shadow-sm"
                    : "border-white/8 bg-white/5 hover:border-white/20"
                }`}
              >
                <div
                  className="grid h-9 w-9 place-items-center rounded-xl"
                  style={{
                    background: activeTab === "clock" ? "var(--acc0)" : "rgba(255, 255, 255, 0.08)",
                    color: activeTab === "clock" ? "#000" : "var(--ink)",
                  }}
                >
                  <ClockOnlyIcon size={18} />
                </div>
                <div>
                  <h4 className="font-display text-xs font-bold text-[var(--ink)]">Bedside Clock</h4>
                  <p className="text-[10px] text-[var(--dim)]">Weather & Sleep Timer</p>
                </div>
              </button>

              {/* Themes & FX */}
              <button
                type="button"
                onClick={() => handlePick("customization")}
                className={`flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
                  activeTab === "customization"
                    ? "border-[var(--acc0)]/60 bg-[var(--acc0)]/15 shadow-sm"
                    : "border-white/8 bg-white/5 hover:border-white/20"
                }`}
              >
                <div
                  className="grid h-9 w-9 place-items-center rounded-xl"
                  style={{
                    background: activeTab === "customization" ? "var(--acc0)" : "rgba(255, 255, 255, 0.08)",
                    color: activeTab === "customization" ? "#000" : "var(--ink)",
                  }}
                >
                  <PaletteIcon size={18} />
                </div>
                <div>
                  <h4 className="font-display text-xs font-bold text-[var(--ink)]">Themes & FX</h4>
                  <p className="text-[10px] text-[var(--dim)]">Accents, Blur & Wallpaper</p>
                </div>
              </button>

              {/* Live Room (full width) */}
              <button
                type="button"
                onClick={() => handlePick("room")}
                className={`col-span-2 flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
                  activeTab === "room"
                    ? "border-[var(--acc0)]/60 bg-[var(--acc0)]/15 shadow-sm"
                    : "border-white/8 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-9 w-9 place-items-center rounded-xl"
                    style={{
                      background: activeTab === "room" ? "var(--acc0)" : "rgba(255, 255, 255, 0.08)",
                      color: activeTab === "room" ? "#000" : "var(--ink)",
                    }}
                  >
                    <GroupIcon size={18} />
                  </div>
                  <div>
                    <h4 className="font-display text-xs font-bold text-[var(--ink)]">Live Room</h4>
                    <p className="text-[10px] text-[var(--dim)]">
                      {inRoom
                        ? `${memberCount} online · ${chatCount} messages`
                        : "Create or join a listen-together room"}
                    </p>
                  </div>
                </div>

                <span
                  className="rounded-full px-2.5 py-1 font-tmono text-[10px] font-semibold"
                  style={{
                    background: inRoom ? "rgba(74, 222, 128, 0.15)" : "rgba(255, 255, 255, 0.08)",
                    color: inRoom ? "#4ade80" : "var(--dim)",
                  }}
                >
                  {inRoom ? "Connected" : "Lobby"}
                </span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
