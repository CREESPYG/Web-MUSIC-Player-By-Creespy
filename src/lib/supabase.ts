import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Safe access for Vite environment variables with project defaults
const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};

export const SUPABASE_URL: string =
  metaEnv.VITE_SUPABASE_URL || "https://azdhaulwcabrrgcanbsq.supabase.co";

export const SUPABASE_KEY: string =
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_PK8F030-iu0VYi3SI2N2bw_dYJFBD8C";

/** Shared realtime client — high-frequency heartbeat and resilient broadcast throughput. */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: {
    params: {
      eventsPerSecond: 50,
    },
    heartbeatIntervalMs: 5000,
    reconnectAfterMs: (tries: number) => {
      const delays = [100, 300, 750, 1500, 3000];
      return delays[Math.min(tries - 1, delays.length - 1)] || 3000;
    },
    timeout: 7000,
  },
});

export const PRESENCE_ROOM = "ripple-online";
