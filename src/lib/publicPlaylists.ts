/**
 * Public Playlists Service
 * ========================
 * Syncs public playlists to Supabase so they are visible to ALL users worldwide.
 * Private playlists remain local (localStorage only).
 *
 * Table: public.public_playlists
 * - Readable by everyone (anon key, no auth required)
 * - Writable by owner_uid match (browser localStorage uid)
 */

import { supabase } from "./supabase";
import { userId } from "./room";
import type { CustomPlaylist } from "./persistence";

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
  const { data, error } = await supabase
    .from("public_playlists")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.warn("[publicPlaylists] fetch error:", error.message);
    return [];
  }

  return (data ?? []).map(rowToPlaylist);
}

/** Publish or update a single playlist in Supabase (upsert) */
export async function publishPlaylist(playlist: CustomPlaylist): Promise<boolean> {
  const uid = userId();
  const { error } = await supabase.from("public_playlists").upsert(
    {
      id: playlist.id,
      owner_uid: uid,
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
  const { error } = await supabase
    .from("public_playlists")
    .delete()
    .eq("id", playlistId)
    .eq("owner_uid", userId());

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

/** Subscribe to real-time changes in the public playlists table */
export function subscribeToPublicPlaylists(
  onUpdate: (playlists: CustomPlaylist[]) => void
): () => void {
  const channel = supabase
    .channel("public_playlists_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "public_playlists" },
      async () => {
        const updated = await fetchGlobalPublicPlaylists();
        onUpdate(updated);
      }
    )
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        console.log("[publicPlaylists] realtime subscribed");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[publicPlaylists] realtime subscription failed:", status);
      }
    });

  return () => {
    supabase.removeChannel(channel);
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
