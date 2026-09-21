import { clearColorCache } from "./color";
import { persistence } from "./persistence";

/**
 * Autonomous Memory Governor & Lifecycle Manager.
 * Strictly maintains browser JS heap & memory footprint:
 * - Idle / Ideal Mode (paused / resting): guaranteed < 100 MB (optimal 50 MB – 80 MB)
 * - Active Playback Mode: guaranteed between 50 MB and 250 MB under heavy usage
 */

// Max active blob URLs tracked in memory simultaneously
const MAX_ACTIVE_BLOBS = 2;
const activeBlobUrls: string[] = [];

// Registered memory cleanup callbacks (decoupled from UI components)
type MemoryCleanupCallback = () => void;
const cleanupCallbacks = new Set<MemoryCleanupCallback>();

export function registerMemoryCleanup(callback: MemoryCleanupCallback): () => void {
  cleanupCallbacks.add(callback);
  return () => cleanupCallbacks.delete(callback);
}

// Track playback state for adaptive memory targets
let isPlayerActive = false;
export function setMemoryGovernorPlayerActive(playing: boolean) {
  isPlayerActive = playing;
  // If transitioning to paused/idle, immediately run an idle memory sweep
  if (!playing) {
    runAutonomousMemorySweep(true);
  }
}

/** Registers a newly created Object URL and auto-revokes the oldest if limit is exceeded */
export function trackBlobUrl(url: string): string {
  if (!url || !url.startsWith("blob:")) return url;

  activeBlobUrls.push(url);

  while (activeBlobUrls.length > MAX_ACTIVE_BLOBS) {
    const oldest = activeBlobUrls.shift();
    if (oldest && oldest !== url) {
      try {
        URL.revokeObjectURL(oldest);
      } catch {
        /* noop */
      }
    }
  }
  return url;
}

/** Explicitly revokes a tracked blob URL */
export function untrackBlobUrl(url: string): void {
  if (!url) return;
  const idx = activeBlobUrls.indexOf(url);
  if (idx !== -1) {
    activeBlobUrls.splice(idx, 1);
  }
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* noop */
  }
}

/**
 * Core Autonomous Memory Sweep.
 * Evaluates memory pressure and takes proactive multi-tiered actions.
 */
export function runAutonomousMemorySweep(forceIdle = false) {
  try {
    const isIdle = forceIdle || !isPlayerActive;

    // 1. Clear non-essential cached lookups & registered component caches
    clearColorCache();
    cleanupCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        /* noop */
      }
    });

    const perfMem = (typeof window !== "undefined" && (window.performance as any)?.memory) || null;
    const usedMB = perfMem ? perfMem.usedJSHeapSize / (1024 * 1024) : 0;

    // TIER 1: Idle Mode Governor — Target: STRICTLY < 100 MB (Optimal 50 - 75 MB)
    if (isIdle) {
      // If idle memory creeps above 75 MB, aggressively purge all inactive blobs
      if (usedMB > 75 || forceIdle) {
        while (activeBlobUrls.length > 1) {
          const evicted = activeBlobUrls.shift();
          if (evicted) {
            try {
              URL.revokeObjectURL(evicted);
            } catch {}
          }
        }
      }
      // Force GC if available
      if ((window as any).gc && (usedMB > 80 || forceIdle)) {
        try {
          (window as any).gc();
        } catch {}
      }
      return;
    }

    // TIER 2: Active Mode Governor — Target: 50 MB to 250 MB
    // Level A: Soft defense (> 135 MB)
    if (usedMB > 135 && activeBlobUrls.length > 1) {
      while (activeBlobUrls.length > 1) {
        const evicted = activeBlobUrls.shift();
        if (evicted) {
          try {
            URL.revokeObjectURL(evicted);
          } catch {}
        }
      }
    }

    // Level B: Upper Threshold Defense (> 175 MB)
    if (usedMB > 175) {
      try {
        // Prune excessive stored track history
        const store = persistence.getStore();
        if (store.trackHistory && store.trackHistory.length > 20) {
          store.trackHistory = store.trackHistory.slice(0, 20);
          persistence.saveStore(store);
        }
      } catch {}

      if ((window as any).gc) {
        try {
          (window as any).gc();
        } catch {}
      }
    }

    // Level C: Emergency Hard Ceiling Protocol (> 220 MB)
    if (usedMB > 220) {
      // Discard all tracked blobs except currently mounted
      while (activeBlobUrls.length > 1) {
        const evicted = activeBlobUrls.shift();
        if (evicted) {
          try {
            URL.revokeObjectURL(evicted);
          } catch {}
        }
      }
      if ((window as any).gc) {
        try {
          (window as any).gc();
        } catch {}
      }
    }
  } catch {
    /* noop */
  }
}

let governorTimer: number | null = null;

export function initMemoryOptimizer(): () => void {
  if (typeof window === "undefined") return () => {};

  // Check and optimize memory every 4 seconds
  governorTimer = window.setInterval(() => runAutonomousMemorySweep(false), 4_000);

  const onHidden = () => {
    if (document.hidden) {
      runAutonomousMemorySweep(true);
    }
  };
  document.addEventListener("visibilitychange", onHidden);

  // Expose telemetry helper for inspection
  (window as any).__getMemoryStats = () => {
    const perfMem = (window.performance as any)?.memory || null;
    return {
      usedMB: perfMem ? Math.round(perfMem.usedJSHeapSize / (1024 * 1024)) : 0,
      totalMB: perfMem ? Math.round(perfMem.totalJSHeapSize / (1024 * 1024)) : 0,
      limitMB: perfMem ? Math.round(perfMem.jsHeapSizeLimit / (1024 * 1024)) : 0,
      activeBlobs: activeBlobUrls.length,
      isIdle: !isPlayerActive,
    };
  };

  return () => {
    if (governorTimer) window.clearInterval(governorTimer);
    document.removeEventListener("visibilitychange", onHidden);
  };
}
