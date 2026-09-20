import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "../lib/realtime";
import { supabase, PRESENCE_ROOM } from "../lib/realtime";

export type PresenceMode = "global" | "local" | "connecting";

export interface Peer {
  id: string;
  at: number;
  hue: number;
  where: string;
  mine: boolean;
}

/**
 * Local live-user tracking (no backend).
 *
 * Each open tab joins a shared local presence channel with a unique key; a
 * BroadcastChannel + localStorage roster keeps tabs of this browser in sync.
 * `online` therefore reflects real, currently-open tabs in this browser.
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
  const [mode, setMode] = useState<PresenceMode>("local");
  const modeRef = useRef<PresenceMode>("local");
  modeRef.current = mode;

  useEffect(() => {
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let localCh: BroadcastChannel | null = null;
    let localTimer = 0;
    const where = `tab-${me.current.slice(-3)}`;

    /* ---------------- local realtime presence ---------------- */
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

    const startLocal = () => {
      if (disposed) return;
      setMode("local");

      const stamp = () => {
        const map = readLocal();
        const now = Date.now();
        Object.keys(map).forEach((k) => {
          if (now - map[k].at > TTL_MS) delete map[k];
        });
        map[me.current] = { id: me.current, at: now, hue: hue.current, where, mine: true };
        writeLocal(map);
        setPeers(
          Object.values(map)
            .map((p) => ({ ...p, mine: p.id === me.current }))
            .sort((a, b) => (a.mine ? -1 : b.mine ? 1 : a.id.localeCompare(b.id)))
        );
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
            setMode("local");
            if (localTimer) window.clearInterval(localTimer);
            try {
              localCh?.close();
            } catch {
              /* noop */
            }
            await channel!.track({ hue: hue.current, where, at: Date.now() });
          }
        });

      // If the local channel hasn't produced a roster shortly, fall back to the
      // pure localStorage + BroadcastChannel counter.
      startLocal();
    } catch {
      startLocal();
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