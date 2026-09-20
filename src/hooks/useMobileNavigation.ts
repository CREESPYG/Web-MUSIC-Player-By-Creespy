import { useCallback, useEffect, useRef, useState } from "react";

export type MobileTab =
  | "player"
  | "playlist"
  | "room"
  | "queue"
  | "clock"
  | "customization";

export interface MobileNavigationApi {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  showExitModal: boolean;
  setShowExitModal: (open: boolean) => void;
  confirmExit: () => void;
  cancelExit: () => void;
}

export function useMobileNavigation(isMobile: boolean): MobileNavigationApi {
  const [activeTab, setActiveTabState] = useState<MobileTab>("player");
  const [moreOpen, setMoreOpen] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  const activeTabRef = useRef<MobileTab>(activeTab);
  activeTabRef.current = activeTab;

  const moreOpenRef = useRef<boolean>(moreOpen);
  moreOpenRef.current = moreOpen;

  const isExitingRef = useRef(false);

  const setActiveTab = useCallback((tab: MobileTab) => {
    setActiveTabState(tab);
    setMoreOpen(false);
  }, []);

  /* ---------------- PopState Hardware / Gesture Back Guard ---------------- */
  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return;

    try {
      window.history.pushState({ page: "mobile_player_root" }, "", window.location.href);
    } catch {
      /* noop */
    }

    const onPopState = (_event: PopStateEvent) => {
      if (isExitingRef.current) return;

      // 1. If "More" sheet is open, close it first
      if (moreOpenRef.current) {
        try { window.history.pushState({ page: "mobile_player_root" }, "", window.location.href); } catch {}
        setMoreOpen(false);
        return;
      }

      const current = activeTabRef.current;

      // 2. If inside a secondary tab (clock, customization, queue), go back to player
      if (current === "clock" || current === "customization" || current === "queue") {
        try { window.history.pushState({ page: "mobile_player_root" }, "", window.location.href); } catch {}
        setActiveTabState("player");
        return;
      }

      // 3. If on playlist or room, navigate to player first
      if (current !== "player") {
        try { window.history.pushState({ page: "mobile_player_root" }, "", window.location.href); } catch {}
        setActiveTabState("player");
        return;
      }

      // 4. If already on root Player screen, show confirmation modal
      try { window.history.pushState({ page: "mobile_player_root" }, "", window.location.href); } catch {}
      setShowExitModal(true);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [isMobile]);

  const confirmExit = useCallback(() => {
    isExitingRef.current = true;
    setShowExitModal(false);
    window.history.back();
  }, []);

  const cancelExit = useCallback(() => {
    setShowExitModal(false);
  }, []);

  return {
    activeTab,
    setActiveTab,
    moreOpen,
    setMoreOpen,
    showExitModal,
    setShowExitModal,
    confirmExit,
    cancelExit,
  };
}
