/**
 * Local Realtime Layer
 * ====================
 * A dependency-free replacement for the Supabase Realtime client. Presence,
 * channels, broadcast and room sync run through BroadcastChannel + localStorage
 * so everything works across tabs of the same browser with no cloud backend.
 *
 * The public surface mirrors the Supabase API the app already uses:
 *   supabase.channel(name, opts)        -> channel
 *   channel.on(type, filter, cb)        -> channel (chainable)
 *   channel.subscribe(statusCb)         -> channel
 *   channel.track(payload)              -> Promise
 *   channel.untrack()                   -> Promise
 *   channel.presenceState()             -> Record<string, any[]>
 *   channel.send({ type, event, payload }) -> Promise<"ok">
 *   supabase.removeChannel(channel)
 *   supabase.realtime                   -> watchdog stub
 */

export type RealtimeChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export interface RealtimeChannel {
  state: "open" | "closed" | "errored";
  on(
    type: string,
    filter: Record<string, unknown>,
    cb: (msg: any) => void
  ): RealtimeChannel;
  subscribe(cb?: (status: string, err?: Error) => void): RealtimeChannel;
  track(payload: unknown): Promise<void>;
  untrack(): Promise<void>;
  presenceState(): Record<string, any[]>;
  send(payload: { type: string; event: string; payload: any }): Promise<"ok">;
  close(): void;
}

export const PRESENCE_ROOM = "ripple-online";

const PRESENCE_TTL = 60000;
const HEARTBEAT_MS = 25000;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface StoredPresence {
  payload: any;
  at: number;
}

class LocalChannel implements RealtimeChannel {
  state: "open" | "closed" | "errored" = "open";

  private readonly name: string;
  private readonly presenceKey: string;
  private readonly tab: string;
  private readonly bcName: string;
  private listeners = new Set<{
    type: string;
    event?: string;
    cb: (msg: any) => void;
  }>();
  private subs = new Set<(status: string, err?: Error) => void>();
  private bc: BroadcastChannel | null = null;
  private own: any = undefined;
  private presence: Record<string, any[]> = {};
  private heartbeatId = 0;
  private joined = false;

  constructor(name: string, opts?: any) {
    this.name = name;
    this.presenceKey = opts?.config?.presence?.key || "";
    this.tab = (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("ripple.rt.tab") : null) || randomId();
    this.bcName = `creespy-rt-${name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}`;
  }

  on(type: string, filter: Record<string, unknown>, cb: (msg: any) => void): RealtimeChannel {
    this.listeners.add({ type, event: (filter as any)?.event as string | undefined, cb });
    return this;
  }

  subscribe(cb?: (status: string, err?: Error) => void): RealtimeChannel {
    if (cb) this.subs.add(cb);
    if (this.joined) return this;
    this.joined = true;

    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.bc = new BroadcastChannel(this.bcName);
        this.bc.onmessage = (e) => this.onMessage(e.data);
        this.bc.postMessage({ mt: "presence_probe", channel: this.name, from: this.tab });
      } catch {
        this.bc = null;
      }
    }

    queueMicrotask(() => {
      if (this.state === "closed") return;
      this.emitStatus("SUBSCRIBED");
      this.reconcilePresence(true);
    });
    return this;
  }

  async track(payload: unknown): Promise<void> {
    this.own = payload;
    const key = this.presenceKey || `local-${this.tab}`;
    const store = this.readStore();
    store[key] = { payload, at: Date.now() };
    this.writeStore(store);
    this.reconcilePresence(true);
    this.ensureHeartbeat();
    this.post({ mt: "presence_ping", channel: this.name, from: this.tab });
  }

  async untrack(): Promise<void> {
    const key = this.presenceKey || `local-${this.tab}`;
    const store = this.readStore();
    delete store[key];
    this.writeStore(store);
    this.own = undefined;
    this.reconcilePresence(true);
    this.clearHeartbeat();
    this.post({ mt: "presence_ping", channel: this.name, from: this.tab });
  }

  presenceState(): Record<string, any[]> {
    return this.presence;
  }

  async send(payload: { type: string; event: string; payload: any }): Promise<"ok"> {
    this.post({ mt: "broadcast", event: payload.event, payload: payload.payload, from: this.tab });
    return "ok";
  }

  close(): void {
    this.clearHeartbeat();
    this.untrack().catch(() => {});
    const prev = this.state;
    this.state = "closed";
    if (prev !== "closed") this.emitStatus("CLOSED");
    this.listeners.clear();
    this.subs.clear();
    try {
      this.bc?.close();
    } catch {}
    this.bc = null;
  }

  /* ---------------------------------- internals ---------------------------------- */

  private storageKey(): string {
    return `creespy.rt.presence.${this.name}`;
  }

  private readStore(): Record<string, StoredPresence> {
    try {
      const raw = localStorage.getItem(this.storageKey());
      const obj: Record<string, StoredPresence> = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      for (const k of Object.keys(obj)) {
        if (now - (obj[k]?.at || 0) > PRESENCE_TTL) delete obj[k];
      }
      return obj;
    } catch {
      return {};
    }
  }

  private writeStore(store: Record<string, StoredPresence>): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(store));
    } catch {}
  }

  private post(msg: any): void {
    try {
      this.bc?.postMessage(msg);
    } catch {}
  }

  private onMessage(msg: any): void {
    if (!msg || typeof msg !== "object") return;

    if (msg.mt === "presence_probe" || msg.mt === "presence_ping") {
      this.reconcilePresence(true);
      return;
    }

    if (msg.mt === "broadcast") {
      for (const l of this.listeners) {
        if (l.type === "broadcast" && (!l.event || l.event === msg.event)) {
          try {
            l.cb({ event: msg.event, type: "broadcast", payload: msg.payload });
          } catch {}
        }
      }
    }
  }

  private reconcilePresence(fireEvents: boolean): void {
    const store = this.readStore();
    const next: Record<string, any[]> = {};
    for (const k of Object.keys(store)) {
      next[k] = [store[k].payload];
    }

    if (fireEvents) {
      const prevKeys = new Set(Object.keys(this.presence));
      const nextKeys = new Set(Object.keys(next));

      for (const k of nextKeys) {
        if (!prevKeys.has(k)) {
          this.emitPresence("join", k, next[k]);
        }
      }
      for (const k of prevKeys) {
        if (!nextKeys.has(k)) {
          this.emitPresence("leave", k, this.presence[k]);
        }
      }
    }

    this.presence = next;
    if (fireEvents) this.emitPresence("sync", "", []);
  }

  private emitPresence(event: string, key: string, presences: any[]): void {
    for (const l of this.listeners) {
      if (l.type === "presence" && (!l.event || l.event === event)) {
        try {
          l.cb({ event, key, currentPresences: presences, newPresences: presences });
        } catch {}
      }
    }
  }

  private emitStatus(status: string): void {
    this.subs.forEach((cb) => {
      try {
        cb(status);
      } catch {}
    });
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatId) return;
    if (typeof window === "undefined") return;
    this.heartbeatId = window.setInterval(() => {
      if (this.own === undefined || this.state === "closed") return;
      const key = this.presenceKey || `local-${this.tab}`;
      const store = this.readStore();
      if (store[key]) {
        store[key].at = Date.now();
        this.writeStore(store);
      }
      this.post({ mt: "presence_ping", channel: this.name, from: this.tab });
    }, HEARTBEAT_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatId) {
      window.clearInterval(this.heartbeatId);
      this.heartbeatId = 0;
    }
  }
}

export const supabase = {
  channel(name: string, opts?: any): RealtimeChannel {
    return new LocalChannel(name, opts);
  },
  removeChannel(ch: unknown): void {
    const c = ch as { close?: () => void } | null | undefined;
    c?.close?.();
  },
  realtime: {
    connect: () => {},
    isConnected: () => true,
    conn: { readyState: 1 },
    socket: { readyState: 1 } as any,
  },
};