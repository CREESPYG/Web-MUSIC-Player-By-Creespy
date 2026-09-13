import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Safe access for Vite environment variables with project defaults
const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};

export const SUPABASE_URL: string =
  metaEnv.VITE_SUPABASE_URL || "https://azdhaulwcabrrgcanbsq.supabase.co";

export const SUPABASE_KEY: string =
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_PK8F030-iu0VYi3SI2N2bw_dYJFBD8C";

/** Shared realtime client — presence rides on a single websocket. */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 20 } },
});

export const PRESENCE_ROOM = "ripple-online";
