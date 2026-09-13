import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, PRESENCE_ROOM } from "../lib/supabase";

export type PresenceMode = "global" | "local" | "connecting";

export interface Peer {
  id: string;
  at: number;
  hue: number;
  where: string;
  mine: boolean;
}

/**
 * Accurate live-user tracking via Supabase Realtime Presence.
 *
 * Each open tab joins a shared presence channel with a unique key; Supabase
 * keeps an authoritative roster synced across every connected device and emits
 * join/leave/sync events. `online` therefore reflects real, currently-connected
 * visitors everywhere — not tabs in one browser, not a simulated number.
 *
 * If the realtime socket can't be reached, it falls back to counting this
 * browser's open tabs via localStorage + BroadcastChannel so the number is
 * still real, just local.
 */
const TTL_MS = 15000;
const LOCAL_KEY = "ripple.local-presence.v4";
const LOCAL_CH = "ripple-local-presence-v4";

/** Per-tab identity (sessionStorage → one identity per tab, never shared). */
function tabId(): string {
  try {
    let id = sessionStorage.getItem("ripple.tab");
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("ripple.tab", id);
    }
    return id;
  } catch {
    return `t-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const readLocal = (): Record<string, Peer> => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch {
    return {};
  }
};
const writeLocal = (m: Record<string, Peer>) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(m));
  } catch {
    /* noop */
  }
};

export function usePresence() {
  const me = useRef(tabId());
  const hue = useRef(Math.floor(Math.random() * 360));
  const [peers, setPeers] = useState<Peer[]>([]);
  const [mode, setMode] = useState<PresenceMode>("connecting");
  const modeRef = useRef<PresenceMode>("connecting");
  modeRef.current = mode;

  useEffect(() => {
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let localCh: BroadcastChannel | null = null;
    let localTimer = 0;
    let fallbackTimer = 0;
    const where = `tab-${me.current.slice(-3)}`;

    /* ---------------- Supabase realtime presence ---------------- */
    const buildFromState = (state: Record<string, any[]>) => {
      const list: Peer[] = [];
      Object.entries(state).forEach(([key, metas]) => {
        const meta = (metas?.[0] ?? {}) as any;
        list.push({
          id: key,
          at: Date.now(),
          hue: typeof meta.hue === "number" ? meta.hue : 210,
          where: typeof meta.where === "string" ? meta.where : "guest",
          mine: key === me.current,
        });
      });
      list.sort((a, b) => (a.mine ? -1 : b.mine ? 1 : a.id.localeCompare(b.id)));
      setPeers(list);
    };

    const startFallback = () => {
      if (modeRef.current === "global" || disposed) return;
      setMode((m) => (m === "global" ? m : "local"));

      const stamp = () => {
        const map = readLocal();
        const now = Date.now();
        Object.keys(map).forEach((k) => {
          if (now - map[k].at > TTL_MS) delete map[k];
        });
        map[me.current] = { id: me.current, at: now, hue: hue.current, where, mine: true };
        writeLocal(map);
        if (modeRef.current !== "global") {
          setPeers(
            Object.values(map)
              .map((p) => ({ ...p, mine: p.id === me.current }))
              .sort((a, b) => (a.mine ? -1 : b.mine ? 1 : a.id.localeCompare(b.id)))
          );
        }
      };

      try {
        localCh = new BroadcastChannel(LOCAL_CH);
        localCh.onmessage = (e) => {
          if (e.data === "hello") stamp();
        };
        localCh.postMessage("hello");
      } catch {
        /* storage polling still covers it */
      }
      stamp();
      localTimer = window.setInterval(stamp, 4000);
    };

    try {
      channel = supabase.channel(PRESENCE_ROOM, {
        config: { presence: { key: me.current } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (disposed || !channel) return;
          buildFromState(channel.presenceState() as Record<string, any[]>);
        })
        .on("presence", { event: "join" }, () => {
          if (disposed || !channel) return;
          buildFromState(channel.presenceState() as Record<string, any[]>);
        })
        .on("presence", { event: "leave" }, () => {
          if (disposed || !channel) return;
          buildFromState(channel.presenceState() as Record<string, any[]>);
        })
        .subscribe(async (status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            setMode("global");
            if (localTimer) window.clearInterval(localTimer);
            try {
              localCh?.close();
            } catch {
              /* noop */
            }
            await channel!.track({ hue: hue.current, where, at: Date.now() });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            startFallback();
          }
        });

      // if realtime hasn't connected shortly, show local count meanwhile
      fallbackTimer = window.setTimeout(() => {
        if (modeRef.current !== "global") startFallback();
      }, 3500);
    } catch {
      startFallback();
    }

    /* ---- clean exit ---- */
    const bye = () => {
      try {
        const map = readLocal();
        delete map[me.current];
        writeLocal(map);
      } catch {
        /* noop */
      }
      try {
        channel?.untrack();
      } catch {
        /* noop */
      }
    };
    window.addEventListener("pagehide", bye);
    window.addEventListener("beforeunload", bye);

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      window.clearInterval(localTimer);
      window.removeEventListener("pagehide", bye);
      window.removeEventListener("beforeunload", bye);
      bye();
      try {
        localCh?.close();
      } catch {
        /* noop */
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return { online: peers.length, peers, me: me.current, mode };
}
