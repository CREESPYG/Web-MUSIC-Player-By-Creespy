/**
 * Public Playlists Service
 * ========================
 * Syncs public playlists to the local browser (localStorage) so they are
 * visible across all open tabs of this browser. Private playlists also remain
 * local (localStorage only).
 *
 * No backend is used: publish / unpublish / play-count / likes all live in
 * localStorage, with a BroadcastChannel keeping open tabs in sync.
 */

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

const CHANNEL_KEY = "ripple.public_playlists.v2";

function notify(): void {
  try {
    new BroadcastChannel(CHANNEL_KEY)?.postMessage("changed");
  } catch {
    // ignore
  }
}

/** Fetch all public playlists stored in this browser (any tab) */
export async function fetchGlobalPublicPlaylists(): Promise<CustomPlaylist[]> {
  try {
    const res = await fetch('/api/playlists');
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(rowToPlaylist);
  } catch {
    return [];
  }
}

/** Publish or update a single playlist (upsert) */
export async function publishPlaylist(playlist: CustomPlaylist): Promise<boolean> {
  const uid = userId();
  try {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: playlist.id,
        owner_uid: uid,
        title: playlist.title,
        description: playlist.description,
        cover_art: playlist.coverArt || playlist.cover,
        tracks: playlist.tracks,
        author: playlist.author,
        track_count: playlist.tracks.length
      })
    });
    if (res.ok) {
      notify();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Remove a playlist from the global directory (only owner can do this) */
export async function unpublishPlaylist(playlistId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/playlists?id=${playlistId}&owner=${userId()}`, { method: 'DELETE' });
    if (res.ok) {
      notify();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Increment play count for a public playlist */
export async function incrementPlayCount(playlistId: string): Promise<void> {
  try {
    await fetch(`/api/playlists?id=${playlistId}&action=play`, { method: 'PATCH' });
  } catch {}
}

/** Subscribe to changes in the public playlists directory (local BroadcastChannel) */
export function subscribeToPublicPlaylists(
  onUpdate: (playlists: CustomPlaylist[]) => void
): () => void {
  let bc: BroadcastChannel | null = null;
  const handler = async () => {
    const updated = await fetchGlobalPublicPlaylists();
    onUpdate(updated);
  };

  try {
    bc = new BroadcastChannel(CHANNEL_KEY);
    bc.onmessage = (e) => {
      if (e.data === "changed") handler();
    };
  } catch {
    bc = null;
  }

  return () => {
    try {
      bc?.close();
    } catch {}
  };
}

function rowToPlaylist(row: PublicPlaylistRow): CustomPlaylist {
  let parsedTracks = [];
  try {
    parsedTracks = typeof row.tracks === 'string' ? JSON.parse(row.tracks) : row.tracks;
  } catch {}
  if (!Array.isArray(parsedTracks)) parsedTracks = [];

  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    isPublic: true,
    cover: row.cover_art || undefined,
    coverArt: row.cover_art || undefined,
    tracks: parsedTracks,
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