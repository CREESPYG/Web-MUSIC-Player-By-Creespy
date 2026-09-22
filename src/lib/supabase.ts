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

/**
 * Phase 26 — anonymous-auth client used for WRITE operations only.
 *
 * Server-side ownership enforcement: once the Supabase project has
 *   * Anonymous sign-ins enabled (Authentication → Providers → Anonymous),
 *   * RLS enabled on `public_playlists` with `auth.uid() = owner_uid`
 *     policies for UPDATE/DELETE (SQL provided in the phase report),
 * rows are truly owned by the auth user — a browser-supplied uid can no
 * longer spoof ownership. If anonymous auth is unavailable (legacy project
 * without it), this resolves to null and callers fall back to the prior
 * advisory-uid write path (documented as a limited-mode).
 */
let authedPromise: Promise<SupabaseClient | null> | null = null;

export function getAuthedClient(): Promise<SupabaseClient | null> {
  if (!authedPromise) {
    authedPromise = (async () => {
      try {
        const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await client.auth.signInAnonymously();
        if (error || !data?.user) return null;
        return client;
      } catch {
        return null;
      }
    })();
  }
  return authedPromise;
}

export const PRESENCE_ROOM = "ripple-online";
