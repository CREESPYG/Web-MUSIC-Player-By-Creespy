/**
 * Public Playlists Service
 * ========================
 * Syncs public playlists to Supabase so they are visible to ALL users worldwide.
 * Private playlists remain local (localStorage only).
 *
 * Table: public.public_playlists
 * - Readable by everyone (anon key, no auth required)
 * - Writable only by the owning anonymous-auth user (auth.uid() = owner_uid,
 *   enforced by RLS policies — see Phase 26 security report for the SQL).
 *   Legacy fallback (project without anonymous sign-ins) uses a browser uid
 *   advisory write path — documented limited mode.
 */

import { supabase, getAuthedClient } from "./supabase";
import { userId } from "./room";
import type { CustomPlaylist } from "./persistence";

/**
 * Phase 26 — server-enforced ownership:
 *   · If anonymous auth is available, writes run as the auth user and
 *     `owner_uid` = auth uid. RLS policies (see phase report SQL) then
 *     REJECT updates/deletes where `auth.uid() <> owner_uid`.
 *   · If auth is unavailable (project without anonymous sign-ins), falls
 *     back to the legacy advisory browser-uid write path (limited mode —
 *     ownership is client-asserted only). Fetch stays fully anon in both.
 */
async function writeOwner(): Promise<{ ownerUid: string; client: typeof supabase; serverEnforced: boolean }> {
  const authed = await getAuthedClient();
  if (authed) {
    const { data } = await authed.auth.getUser();
    if (data?.user?.id) {
      return { ownerUid: data.user.id, client: authed, serverEnforced: true };
    }
  }
  return { ownerUid: userId(), client: supabase, serverEnforced: false };
}

export interface PublicPlaylistRow {
  id: string;
  owner_uid: string;
  title: string;
  description: string;
  cover_art: string | null;
  track_count: number;
  tracks: any[];
  author: string;
  play_count: number;
  created_at: string;
  updated_at: string;
}

/** Fetch all public playlists from Supabase (global, from any user) */
export async function fetchGlobalPublicPlaylists(): Promise<CustomPlaylist[]> {
  const rows: PublicPlaylistRow[] = [];
  const PAGE = 100;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("public_playlists")
      .select("*")
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      console.warn("[publicPlaylists] fetch error:", error.message);
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  return rows.map(rowToPlaylist);
}

/** Publish or update a single playlist in Supabase (upsert) */
export async function publishPlaylist(playlist: CustomPlaylist): Promise<boolean> {
  const { ownerUid, client } = await writeOwner();
  const { error } = await client.from("public_playlists").upsert(
    {
      id: playlist.id,
      owner_uid: ownerUid,
      title: playlist.title,
      description: playlist.description || "",
      cover_art: playlist.coverArt || playlist.cover || null,
      track_count: playlist.tracks.length,
      tracks: playlist.tracks,
      author: playlist.author || "Anonymous",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn("[publicPlaylists] publish error:", error.message);
    return false;
  }
  return true;
}

/** Remove a playlist from the global directory (only owner can do this) */
export async function unpublishPlaylist(playlistId: string): Promise<boolean> {
  const { ownerUid, client } = await writeOwner();
  const { error } = await client
    .from("public_playlists")
    .delete()
    .eq("id", playlistId)
    .eq("owner_uid", ownerUid);

  if (error) {
    console.warn("[publicPlaylists] unpublish error:", error.message);
    return false;
  }
  return true;
}

/** Increment play count for a public playlist */
export async function incrementPlayCount(playlistId: string): Promise<void> {
  try {
    await supabase.rpc("increment_playlist_plays", { playlist_id: playlistId });
  } catch {
    // ignore play count errors
  }
}

// ---------------------------------------------------------------------------
// Realtime — ONE shared channel for the whole app.
//
// Why: the phoenix adapter state is topic-shared. If any channel with a given
// topic is already joining/joined, calling `.channel(sameTopic).on(
// 'postgres_changes', …)` throws `cannot add postgres_changes callbacks …
// after subscribe()`. With SearchModal + PlaylistsView + MobilePlaylistScreen
// each subscribing independently, the second subscriber threw inside a React
// effect and crashed the section. A module-level singleton subscribes exactly
// once and fans updates out to a listener set — never adding bindings twice.
// If realtime attach fails for any reason, fall back to light polling so the
// Community section still loads.
// ---------------------------------------------------------------------------

type PublicPlaylistListener = (playlists: CustomPlaylist[]) => void;

const publicPlaylistListeners = new Set<PublicPlaylistListener>();
let sharedPlaylistChannel: ReturnType<typeof supabase.channel> | null = null;
let realtimeDisabled = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function refreshPublicPlaylistListeners(): Promise<void> {
  try {
    const list = await fetchGlobalPublicPlaylists();
    publicPlaylistListeners.forEach((fn) => {
      try {
        fn(list);
      } catch {
        /* one bad listener must not break the rest */
      }
    });
  } catch (err) {
    console.warn("[publicPlaylists] refresh failed:", err);
  }
}

function startPollFallback(): void {
  if (pollTimer !== null || typeof window === "undefined") return;
  pollTimer = setInterval(() => {
    if (publicPlaylistListeners.size > 0 && document.visibilityState !== "hidden") {
      void refreshPublicPlaylistListeners();
    }
  }, 30000);
}

function ensurePublicPlaylistRealtime(): void {
  if (sharedPlaylistChannel || realtimeDisabled) return;
  try {
    const channel = supabase.channel("public_playlists_changes");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "public_playlists" },
      () => {
        void refreshPublicPlaylistListeners();
      }
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (pollTimer !== null && typeof window !== "undefined") {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      } else {
        console.warn("[publicPlaylists] realtime subscription status:", status);
        // Realtime is down/reconnecting — keep the Community list fresh anyway.
        startPollFallback();
      }
    });
    sharedPlaylistChannel = channel;
  } catch (err) {
    console.warn("[publicPlaylists] realtime attach failed — using 30s polling:", err);
    realtimeDisabled = true;
    startPollFallback();
  }
}

/**
 * Subscribe to real-time changes in the public playlists table.
 * Returns an unsubscribe function; the shared channel stays open for the
 * session (cheap, and avoids re-adding postgres_changes bindings).
 */
export function subscribeToPublicPlaylists(
  onUpdate: (playlists: CustomPlaylist[]) => void
): () => void {
  publicPlaylistListeners.add(onUpdate);
  ensurePublicPlaylistRealtime();
  if (realtimeDisabled) startPollFallback();
  return () => {
    publicPlaylistListeners.delete(onUpdate);
    if (publicPlaylistListeners.size === 0 && pollTimer !== null && typeof window !== "undefined") {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

function rowToPlaylist(row: PublicPlaylistRow): CustomPlaylist {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    isPublic: true,
    cover: row.cover_art || undefined,
    coverArt: row.cover_art || undefined,
    tracks: Array.isArray(row.tracks) ? row.tracks : [],
    author: row.author || "Anonymous",
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

// --- Global Playlist Like Counts (device-based: one userId = one count) ---
const LIKES_STORAGE_KEY = "ripple.global_playlist_likes_v2";

interface LikeData {
  count: number;
  likedBy: string[];
}

function getAllLikeData(): Record<string, LikeData> {
  try {
    const raw = localStorage.getItem(LIKES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Migrate from old format (plain numbers)
    const result: Record<string, LikeData> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number") {
        result[k] = { count: v, likedBy: [] };
      } else if (v && typeof v === "object" && "count" in (v as any)) {
        result[k] = v as LikeData;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveAllLikeData(data: Record<string, LikeData>): void {
  try {
    localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/** Get the like count for a global playlist */
export function getGlobalPlaylistLikeCount(playlistId: string): number {
  return getAllLikeData()[playlistId]?.count || 0;
}

/** Check if the current device/user has liked a global playlist */
export function hasUserLikedGlobalPlaylist(playlistId: string): boolean {
  const uid = userId();
  const data = getAllLikeData()[playlistId];
  return data?.likedBy.includes(uid) ?? false;
}

/** Increment the like count for a global playlist (one device = one count) */
export function incrementGlobalPlaylistLikes(playlistId: string): number {
  const uid = userId();
  const all = getAllLikeData();
  const data = all[playlistId] || { count: 0, likedBy: [] };
  if (!data.likedBy.includes(uid)) {
    data.likedBy.push(uid);
    data.count = data.likedBy.length;
  }
  all[playlistId] = data;
  saveAllLikeData(all);
  return data.count;
}

/** Decrement the like count for a global playlist */
export function decrementGlobalPlaylistLikes(playlistId: string): number {
  const uid = userId();
  const all = getAllLikeData();
  const data = all[playlistId] || { count: 0, likedBy: [] };
  data.likedBy = data.likedBy.filter((id) => id !== uid);
  data.count = data.likedBy.length;
  all[playlistId] = data;
  saveAllLikeData(all);
  return data.count;
}
