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
export type MemberRole = "owner" | "host" | "member";
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
  hostId: string; // The Owner of the room (creator)
  hostName: string;
  chatEnabled: boolean;
  voiceEnabled: boolean;
  myId?: string;
}

export type MemberState = "active" | "away" | "reconnecting" | "left";

export interface Member {
  id: string;
  nickname: string;
  name?: string;
  role: MemberRole;
  at: number;
  joinedAt?: number;
  state?: MemberState;
  lastSeen?: number;
  inVoice?: boolean;
  selfMuted?: boolean;
  hostMuted?: boolean;
  canSpeak?: boolean;
  canHear?: boolean;
  speaking?: boolean;
}

export interface VoiceParticipant {
  userId: string;
  nickname: string;
  role: MemberRole;
  selfMuted: boolean;
  hostMuted: boolean;
  canSpeak: boolean;
  canHear: boolean;
  speaking: boolean;
  connectedAt: number;
}

export interface JoinRequest {
  userId: string;
  nickname: string;
  at: number;
}

export type ChatDeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatMsg {
  id: string;
  userId: string;
  nickname: string;
  message: string;
  ts: number;
  mine?: boolean;
  system?: boolean;
  status?: ChatDeliveryStatus;
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

let memoryTabUid = "";

export function userId(): string {
  if (typeof window !== "undefined" && (window as any).__CREESPY_UID__) {
    return (window as any).__CREESPY_UID__;
  }
  if (!memoryTabUid) {
    memoryTabUid = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (typeof window !== "undefined") {
      (window as any).__CREESPY_UID__ = memoryTabUid;
    }
  }
  return memoryTabUid;
}

export function savedNickname(): string {
  try {
    const raw = (localStorage.getItem("creespy.nick") || "").trim();
    if (!raw || raw === "false" || raw === "null" || raw === "undefined") return "";
    return raw;
  } catch {
    return "";
  }
}

export function saveNickname(n: string) {
  try {
    const clean = String(n || "").trim().slice(0, 24);
    if (!clean || clean === "false" || clean === "null" || clean === "undefined") return;
    localStorage.setItem("creespy.nick", clean);
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
export const roomChatChannel = (code: string) => `room:${code.toUpperCase()}:chat`;
export const roomSyncChannel = (code: string) => `room:${code.toUpperCase()}:sync`;

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
  const hashMatch = location.hash.match(/room=([A-Za-z0-9]{4,8})/);
  if (hashMatch) return hashMatch[1].toUpperCase();
  const pathMatch = location.pathname.match(/\/room\/([A-Za-z0-9]{4,8})/i);
  if (pathMatch) return pathMatch[1].toUpperCase();
  return null;
}

/* ---------------- Room Session Persistence ---------------- */

export interface RoomSession {
  roomCode: string;
  roomName: string;
  role: MemberRole;
  userId: string;
  sessionId: string;
  joinedAt: number;
  voiceAutoReconnect?: boolean;
}

const ROOM_SESSION_KEY = "creespy.room_session.v1";
let currentTabSessionId = "";

export function getTabSessionId(): string {
  if (!currentTabSessionId) {
    if (typeof sessionStorage !== "undefined") {
      let id = sessionStorage.getItem("creespy.tab_session_id");
      if (!id) {
        id = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
        sessionStorage.setItem("creespy.tab_session_id", id);
      }
      currentTabSessionId = id;
    } else {
      currentTabSessionId = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    }
  }
  return currentTabSessionId;
}

export function saveRoomSession(session: RoomSession): void {
  try {
    const raw = JSON.stringify(session);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(ROOM_SESSION_KEY, raw);
    }
  } catch {
    /* noop */
  }
}

export function loadRoomSession(): RoomSession | null {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(ROOM_SESSION_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoomSession;
    if (parsed && parsed.roomCode && parsed.userId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearRoomSession(): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(ROOM_SESSION_KEY);
    }
  } catch {
    /* noop */
  }
}

