import { useEffect, useState } from "react";

/**
 * True browser connectivity (navigator.onLine + online/offline events).
 * Distinct from usePresence's `online` (count of connected visitors).
 * Live in a ref so network-gated code paths can read the freshest value
 * without re-subscribing.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}