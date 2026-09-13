/**
 * Room Mode — types & helpers for CREESPY "Listen Together".
 *
 * The realtime layer rides on Supabase Realtime (broadcast + presence). Two
 * channels per room:
 *   room:{code}:lobby  → open; carries join_request / join_response only
 *   room:{code}        → approved host + members only; presence, playback, chat
 *
 * Pending / rejected users never subscribe to the members channel, so private
 * playback & chat aren't delivered to them. For DB-backed persistence and
 * server-enforced RLS, apply supabase/schema.sql (playback still syncs by
 * timestamp, never per-frame writes).
 */

export type RoomType = "public" | "private";
export type MemberRole = "host" | "member";
export type PublicControl = "host" | "shared";

export interface Permissions {
  play_pause: boolean;
  next: boolean;
  previous: boolean;
  seek: boolean;
  add_song: boolean;
  queue_control: boolean;
  shuffle: boolean;
  repeat: boolean;
}

export const HOST_ONLY_PERMS: Permissions = {
  play_pause: false,
  next: false,
  previous: false,
  seek: false,
  add_song: false,
  queue_control: false,
  shuffle: false,
  repeat: false,
};

export const SHARED_PERMS: Permissions = {
  play_pause: true,
  next: true,
  previous: true,
  seek: true,
  add_song: true,
  queue_control: false,
  shuffle: false,
  repeat: false,
};

export interface RoomInfo {
  code: string;
  name: string;
  type: RoomType;
  requireApproval: boolean;
  hostId: string;
  hostName: string;
  chatEnabled: boolean;
}

export interface Member {
  id: string;
  nickname: string;
  role: MemberRole;
  at: number;
}

export interface JoinRequest {
  userId: string;
  nickname: string;
  at: number;
}

export interface ChatMsg {
  id: string;
  userId: string;
  nickname: string;
  message: string;
  ts: number;
  mine?: boolean;
}

export interface PlaybackState {
  videoId: string;
  title: string;
  artist: string;
  thumb: string;
  isPlaying: boolean;
  position: number;
  ts: number;
  by: string;
}

export type RoomStatus =
  | "idle"
  | "hosting"
  | "requesting"
  | "waiting"
  | "member"
  | "denied"
  | "closed"
  | "error";

export type ConnState = "connected" | "reconnecting" | "offline";

/* ---------------- identity + codes ---------------- */

export function userId(): string {
  try {
    let id = localStorage.getItem("creespy.uid");
    if (!id) {
      id = `u-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("creespy.uid", id);
    }
    return id;
  } catch {
    return `u-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function savedNickname(): string {
  try {
    return localStorage.getItem("creespy.nick") || "";
  } catch {
    return "";
  }
}

export function saveNickname(n: string) {
  try {
    localStorage.setItem("creespy.nick", n.slice(0, 24));
  } catch {
    /* noop */
  }
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function genRoomCode(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export const lobbyChannel = (code: string) => `room:${code.toUpperCase()}:lobby`;
export const roomChannel = (code: string) => `room:${code.toUpperCase()}`;

/** Global directory — every public-room host announces here; all clients read it. */
export const DIRECTORY_CHANNEL = "creespy:public-rooms";

export interface PublicRoomEntry {
  code: string;
  name: string;
  hostName: string;
  count: number;
  requireApproval: boolean;
  at: number;
}

export function inviteLink(code: string): string {
  const base = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "";
  return `${base}#room=${code.toUpperCase()}`;
}

export function readInviteCode(): string | null {
  if (typeof location === "undefined") return null;
  const m = location.hash.match(/room=([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}
