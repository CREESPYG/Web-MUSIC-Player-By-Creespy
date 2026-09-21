import { useEffect, useState } from "react";

export interface ClockState {
  now: Date;
  h24: number;
  hh: string;
  mm: string;
  ss: string;
  ampm: string;
  dateLong: string;
  greeting: string;
}

function computeClock(now: Date): ClockState {
  const h24 = now.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return {
    now,
    h24,
    hh: pad(h12),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds()),
    ampm: h24 < 12 ? "AM" : "PM",
    dateLong: now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    greeting:
      h24 < 5 ? "Still awake" : h24 < 12 ? "Good morning" : h24 < 17 ? "Good afternoon" : h24 < 21 ? "Good evening" : "Good night",
  };
}

let sharedClock = computeClock(new Date());
const listeners = new Set<(c: ClockState) => void>();
let globalTimer: number | null = null;

function startTicker() {
  if (globalTimer !== null || typeof window === "undefined") return;
  globalTimer = window.setInterval(() => {
    sharedClock = computeClock(new Date());
    listeners.forEach((fn) => fn(sharedClock));
  }, 1000);
}

function stopTicker() {
  if (listeners.size === 0 && globalTimer !== null) {
    window.clearInterval(globalTimer);
    globalTimer = null;
  }
}

/**
 * Singleton shared clock hook.
 * Reuses a single shared 1000ms ticker across all clock components
 * preventing duplicate timers, multiple Date allocations, and redundant GC churn.
 */
export function useClock(): ClockState {
  const [clock, setClock] = useState<ClockState>(sharedClock);

  useEffect(() => {
    listeners.add(setClock);
    startTicker();

    return () => {
      listeners.delete(setClock);
      stopTicker();
    };
  }, []);

  return clock;
}
