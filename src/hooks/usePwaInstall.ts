import { useCallback, useEffect, useState } from "react";

export interface PwaApi {
  canInstall: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<void>;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

export function usePwaInstall(): PwaApi {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check standalone mode
    const checkStandalone = () => {
      const isMediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
      const isNavigatorStandalone = (window.navigator as any).standalone === true;
      setIsStandalone(Boolean(isMediaStandalone || isNavigatorStandalone));
    };
    checkStandalone();

    // Listen for PWA installation prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Track fullscreen status
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setCanInstall(false);
        setDeferredPrompt(null);
      }
    } catch {
      /* noop */
    }
  }, [deferredPrompt]);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      /* noop */
    }
  }, []);

  return {
    canInstall,
    isStandalone,
    promptInstall,
    isFullscreen,
    toggleFullscreen,
  };
}
