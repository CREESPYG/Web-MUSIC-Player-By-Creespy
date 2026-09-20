import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, type RealtimeChannel } from "../lib/realtime";
import {
  DIRECTORY_CHANNEL,
  HOST_ONLY_PERMS,
  SHARED_PERMS,
  genRoomCode,
  lobbyChannel,
  roomChannel,
  roomChatChannel,
  roomSyncChannel,
  saveNickname,
  savedNickname,
  userId,
  getTabSessionId,
  clearRoomSession,
  readInviteCode,
  type ChatMsg,
  type ConnState,
  type JoinRequest,
  type Member,
  type MemberRole,
  type MemberState,
  type Permissions,
  type PlaybackState,
  type PublicControl,
  type PublicRoomEntry,
  type RoomInfo,
  type RoomStatus,
  type RoomType,
} from "../lib/room";
import { useVoice } from "./useVoice";
import { backgroundKeepAlive } from "../lib/backgroundKeepAlive";

/** Request browser notification permission if not yet granted */
function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

/** Send a browser notification for a chat message (only when page not focused) */
function notifyChatMessage(msg: ChatMsg, roomName: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  try {
    const n = new Notification(`${msg.nickname} in ${roomName}`, {
      body: msg.message.slice(0, 200),
      icon: "/cover-placeholder.jpg",
      tag: `chat-${msg.id}`,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    setTimeout(() => n.close(), 6000);
  } catch {}
}

/** Create a system chat message */
function systemMsg(text: string): ChatMsg {
  return {
    id: `sys-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    userId: "__system__",
    nickname: "System",
    message: text,
    ts: Date.now(),
    system: true,
  };
}

export interface RoomHandlers {
  /** Read the current local playback so the host can broadcast it. */
  getPlayback: () => Omit<PlaybackState, "ts" | "by"> | null;
  /** Apply a remote playback state to the local player (members). */
  applyPlayback: (pb: PlaybackState) => void;
  /** Read current queue tracks for syncing to new joiners */
  getQueue?: () => any[];
  /** Apply remote queue changes */
  applyQueue?: (queue: any[]) => void;
  /** Toast callback for notifications */
  onToast?: (msg: string) => void;
}

interface CreateOpts {
  name: string;
  type: RoomType;
  requireApproval: boolean;
  control: PublicControl;
  chatEnabled?: boolean;
  voiceEnabled?: boolean;
  nickname?: string;
}

const HEARTBEAT_MS = 4000;

export function useRoom(handlers: RoomHandlers) {
  const me = useRef(userId());
  const hRef = useRef(handlers);
  hRef.current = handlers;

  const [status, setStatus] = useState<RoomStatus>("idle");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const chatRef = useRef<ChatMsg[]>(chat);
  chatRef.current = chat;
  const pendingChatQueue = useRef<ChatMsg[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingMapRef = useRef<Map<string, { nickname: string; until: number }>>(new Map());
  const recentEventsRef = useRef<Map<string, number>>(new Map());
  const lastTypingSentRef = useRef<number>(0);

  const [permissions, setPermissions] = useState<Permissions>(HOST_ONLY_PERMS);
  const [connection, setConnection] = useState<ConnState>("offline");
  const [nickname, setNickname] = useState(savedNickname());
  const [banned] = useState<Set<string>>(() => new Set());
  const [publicRooms, setPublicRooms] = useState<PublicRoomEntry[]>([]);
  const [activeChannel, setActiveChannel] = useState<RealtimeChannel | null>(null);

  const roomRef = useRef<RoomInfo | null>(null);
  roomRef.current = room;
  const permRef = useRef<Permissions>(permissions);
  permRef.current = permissions;
  const statusRef = useRef<RoomStatus>(status);
  statusRef.current = status;

  const lobbyRef = useRef<RealtimeChannel | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const chatChanRef = useRef<RealtimeChannel | null>(null);
  const syncChanRef = useRef<RealtimeChannel | null>(null);
  const dirRef = useRef<RealtimeChannel | null>(null);
  const beatRef = useRef<number>(0);
  const banRef = useRef(banned);
  const joinTimersRef = useRef<number[]>([]);
  const tabSessionId = useRef(getTabSessionId());
  const membersRef = useRef<Member[]>(members);
  membersRef.current = members;
  const knownMembersCacheRef = useRef<Map<string, Member>>(new Map());
  const knownMemberIdsRef = useRef<Set<string>>(new Set());
  const explicitlyLeftRef = useRef<Map<string, number>>(new Map());
  const isRecoveringRef = useRef(false);
  const hasCompletedInitialSyncRef = useRef(false);
  const publicRoomsCacheRef = useRef<Map<string, PublicRoomEntry>>(new Map());

  const isOwner = room?.hostId === me.current || status === "hosting";
  const myRole: MemberRole = useMemo(() => {
    if (room?.hostId === me.current || status === "hosting") return "owner";
    const found = members.find((m) => m.id === me.current);
    if (found?.role === "host") return "host";
    return "member";
  }, [room?.hostId, status, members]);

  const isHost = isOwner || myRole === "host";

  /* ---------- Isolated Voice Engine ---------- */
  const voice = useVoice({
    roomId: room?.code || null,
    channel: activeChannel,
    myUserId: me.current,
    myNickname: nickname,
    myRole,
    voiceEnabled: room?.voiceEnabled ?? true,
    members,
    onToast: (msg) => {
      hRef.current.onToast?.(msg);
    },
  });

  /* ---------- public rooms directory ---------- */
  const syncDirectory = useCallback((ch: RealtimeChannel) => {
    const state = ch.presenceState() as Record<string, any[]>;
    const now = Date.now();
    const activePresenceCodes = new Set<string>();

    Object.values(state).forEach((metas) => {
      const m = (metas?.[0] ?? {}) as any;
      if (m?.code) {
        const cleanCode = String(m.code).trim().toUpperCase();
        if (!cleanCode) return;
        activePresenceCodes.add(cleanCode);
        const entryAt = Number(m.at) || now;
        const existing = publicRoomsCacheRef.current.get(cleanCode);
        if (!existing || entryAt >= existing.at) {
          publicRoomsCacheRef.current.set(cleanCode, {
            code: cleanCode,
            name: m.name || `${m.hostName || "Host"}'s Room`,
            hostName: m.hostName || "Host",
            count: Math.max(1, m.count ?? 1),
            requireApproval: !!m.requireApproval,
            at: entryAt,
          });
        }
      }
    });

    publicRoomsCacheRef.current.forEach((entry, code) => {
      if (!activePresenceCodes.has(code) && now - entry.at > 60000) {
        publicRoomsCacheRef.current.delete(code);
      }
    });

    const list = Array.from(publicRoomsCacheRef.current.values());
    list.sort((a, b) => b.count - a.count || a.at - b.at);
    setPublicRooms(list);
  }, []);

  useEffect(() => {
    const dir = supabase.channel(DIRECTORY_CHANNEL, {
      config: { presence: { key: me.current }, broadcast: { self: false } },
    });
    dirRef.current = dir;

    dir.on("presence", { event: "sync" }, () => syncDirectory(dir));
    dir.on("presence", { event: "join" }, () => syncDirectory(dir));
    dir.on("presence", { event: "leave" }, () => syncDirectory(dir));

    dir.on("broadcast", { event: "directory_update" }, ({ payload }) => {
      const entry = payload?.entry as PublicRoomEntry | undefined;
      if (!entry || !entry.code) return;
      const cleanCode = String(entry.code).trim().toUpperCase();
      publicRoomsCacheRef.current.set(cleanCode, { ...entry, code: cleanCode, at: Date.now() });
      const list = Array.from(publicRoomsCacheRef.current.values());
      list.sort((a, b) => b.count - a.count || a.at - b.at);
      setPublicRooms(list);
    });

    dir.on("broadcast", { event: "directory_remove" }, ({ payload }) => {
      const code = payload?.code ? String(payload.code).trim().toUpperCase() : "";
      if (!code) return;
      publicRoomsCacheRef.current.delete(code);
      const list = Array.from(publicRoomsCacheRef.current.values());
      list.sort((a, b) => b.count - a.count || a.at - b.at);
      setPublicRooms(list);
    });

    dir.on("broadcast", { event: "directory_query" }, () => {
      const r = roomRef.current;
      if (statusRef.current === "hosting" && r && r.type === "public" && r.hostId === me.current) {
        dir.send({
          type: "broadcast",
          event: "directory_update",
          payload: {
            entry: {
              code: r.code,
              name: r.name,
              hostName: r.hostName,
              count: Math.max(1, membersRef.current?.length || 1),
              requireApproval: r.requireApproval,
              at: Date.now(),
            },
          },
        }).catch(() => {});
      }
    });

    dir.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        syncDirectory(dir);
        dir.send({
          type: "broadcast",
          event: "directory_query",
          payload: { from: me.current },
        }).catch(() => {});

        const r = roomRef.current;
        if (statusRef.current === "hosting" && r && r.type === "public" && r.hostId === me.current) {
          const entry: PublicRoomEntry = {
            code: r.code,
            name: r.name,
            hostName: r.hostName,
            count: Math.max(1, membersRef.current?.length || 1),
            requireApproval: r.requireApproval,
            at: Date.now(),
          };
          dir.track(entry).catch(() => {});
          dir.send({
            type: "broadcast",
            event: "directory_update",
            payload: { entry },
          }).catch(() => {});
        }
      }
    });
    return () => {
      supabase.removeChannel(dir);
      dirRef.current = null;
    };
  }, [syncDirectory]);

  /** Publish / refresh this host's public room in the directory (or clear it). */
  const announceDirectory = useCallback((entry: PublicRoomEntry | null) => {
    const dir = dirRef.current;
    if (!dir) return;
    if (entry) {
      dir.track(entry).catch(() => {});
      dir.send({
        type: "broadcast",
        event: "directory_update",
        payload: { entry },
      }).catch(() => {});
    } else {
      dir.untrack().catch(() => {});
      const curCode = roomRef.current?.code;
      if (curCode) {
        dir.send({
          type: "broadcast",
          event: "directory_remove",
          payload: { code: curCode },
        }).catch(() => {});
      }
    }
  }, []);

  /* ---------- cleanup ---------- */
  const teardown = useCallback(() => {
    window.clearInterval(beatRef.current);
    beatRef.current = 0;
    joinTimersRef.current.forEach(window.clearTimeout);
    joinTimersRef.current = [];
    if (lobbyRef.current) {
      supabase.removeChannel(lobbyRef.current);
      lobbyRef.current = null;
    }
    if (chanRef.current) {
      supabase.removeChannel(chanRef.current);
      chanRef.current = null;
    }
    if (chatChanRef.current) {
      supabase.removeChannel(chatChanRef.current);
      chatChanRef.current = null;
    }
    if (syncChanRef.current) {
      supabase.removeChannel(syncChanRef.current);
      syncChanRef.current = null;
    }
    setActiveChannel(null);
    setChat([]);
    chatRef.current = [];
    pendingChatQueue.current = [];
    banRef.current.clear();
    knownMembersCacheRef.current.clear();
    knownMemberIdsRef.current.clear();
    explicitlyLeftRef.current.clear();
    hasCompletedInitialSyncRef.current = false;
  }, []);

  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;

  // Cleanup ONLY on unmount
  useEffect(() => {
    return () => {
      teardownRef.current();
    };
  }, []);

  /* ---------- host broadcast of playback ---------- */
  const pushPlayback = useCallback(() => {
    const ch = syncChanRef.current || chanRef.current;
    if (!ch) return;
    const canDrive = roomRef.current?.hostId === me.current || permRef.current.play_pause;
    if (!canDrive) return;
    const pb = hRef.current.getPlayback();
    if (!pb) return;
    ch.send({
      type: "broadcast",
      event: "playback",
      payload: { ...pb, ts: Date.now(), by: me.current } as PlaybackState,
    }).catch(() => {});
  }, []);

  /* ---------- lobby host channel management ---------- */
  const setupHostLobby = useCallback((code: string, info: RoomInfo) => {
    if (lobbyRef.current) {
      supabase.removeChannel(lobbyRef.current);
      lobbyRef.current = null;
    }
    const lob = supabase.channel(lobbyChannel(code), {
      config: { broadcast: { self: false }, presence: { key: me.current } },
    });
    lobbyRef.current = lob;
    lob.on("broadcast", { event: "join_request" }, ({ payload }) => {
      const req = payload as JoinRequest;
      if (banRef.current.has(req.userId)) {
        lob.send({ type: "broadcast", event: "join_response", payload: { userId: req.userId, approved: false, reason: "banned" } });
        return;
      }
      const cur = roomRef.current;
      if (!cur) return;
      if (cur.type === "public" && !cur.requireApproval) {
        lob.send({
          type: "broadcast",
          event: "join_response",
          payload: { userId: req.userId, approved: true, room: cur, permissions: permRef.current },
        });
        return;
      }
      lob.send({ type: "broadcast", event: "join_ack", payload: { userId: req.userId } });
      setRequests((prev) => (prev.some((r) => r.userId === req.userId) ? prev : [...prev, req]));
    });
    lob.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        lob.track({ role: "host", room: info, permissions: permRef.current, at: Date.now(), sessionId: tabSessionId.current }).catch(() => {});
      }
    });
  }, []);

  /* ---------- flush pending chat queue helper ---------- */
  const flushPendingChatQueue = useCallback(() => {
    const ch = chatChanRef.current || chanRef.current;
    if (!ch || pendingChatQueue.current.length === 0) return;
    const queue = [...pendingChatQueue.current];
    queue.forEach((msg) => {
      ch.send({ type: "broadcast", event: "chat", payload: msg })
        .then((resp) => {
          if (resp === "ok") {
            pendingChatQueue.current = pendingChatQueue.current.filter((m) => m.id !== msg.id);
          }
        })
        .catch(() => {});
    });
  }, []);

  /* ---------- real-time member event notifier (with deduplication) ---------- */
  const notifyMemberEvent = useCallback((event: "join" | "leave", uid: string, nick: string) => {
    if (!uid || uid === me.current) return;
    const key = `${event}:${uid}`;
    const last = recentEventsRef.current.get(key) || 0;
    const now = Date.now();
    if (now - last < 5000) return;
    recentEventsRef.current.set(key, now);

    const raw = String(nick || "").trim();
    const cleanNick =
      raw && raw !== "false" && raw !== "null" && raw !== "undefined"
        ? raw
        : event === "join"
          ? "A listener"
          : "A member";
    const text = event === "join" ? `${cleanNick} joined the room` : `${cleanNick} left the room`;
    hRef.current.onToast?.(text);
    const sys = systemMsg(text);
    setChat((prev) => (prev.some((c) => c.id === sys.id) ? prev : [...prev, sys].slice(-120)));
  }, []);

  /* ---------- robust member roster tracking (tab-switch immune) ---------- */
  const syncMembers = useCallback((ch: RealtimeChannel) => {
    const state = ch.presenceState() as Record<string, any[]>;
    const now = Date.now();
    const currentHostId = roomRef.current?.hostId;
    const rosterMap = new Map<string, Member>();
    const isFirstSync = !hasCompletedInitialSyncRef.current;
    if (isFirstSync) {
      hasCompletedInitialSyncRef.current = true;
    }

    // 1. Process active presences from the channel
    Object.entries(state).forEach(([key, metas]) => {
      const m = (metas?.[0] ?? {}) as any;
      const uid = m.id || key;
      if (!uid) return;

      // If user explicitly left recently (< 60s), ignore lingering presence!
      const leftAt = explicitlyLeftRef.current.get(uid);
      if (leftAt && now - leftAt < 60000) {
        return;
      }
      if (leftAt && now - leftAt >= 60000) {
        explicitlyLeftRef.current.delete(uid);
      }

      const isRoomOwner =
        uid === currentHostId ||
        m.role === "owner" ||
        (uid === me.current && statusRef.current === "hosting");

      const role: MemberRole = isRoomOwner ? "owner" : m.role === "host" ? "host" : "member";
      const rawMetaNick = String(m.nickname || "").trim();
      const memberNick =
        rawMetaNick && rawMetaNick !== "false" && rawMetaNick !== "null" && rawMetaNick !== "undefined"
          ? rawMetaNick
          : isRoomOwner
            ? roomRef.current?.hostName || "Host"
            : "Guest";

      if (isRoomOwner && roomRef.current && (!roomRef.current.hostId || roomRef.current.hostId !== uid)) {
        roomRef.current.hostId = uid;
        roomRef.current.hostName = memberNick;
      }

      const member: Member = {
        id: uid,
        nickname: memberNick,
        name: memberNick,
        role,
        at: m.at || now,
        joinedAt: m.at || now,
        state: (m.state as MemberState) || "active",
        lastSeen: now,
      };

      rosterMap.set(uid, member);
      knownMembersCacheRef.current.set(uid, member);

      // Notify join only once per user session, and NEVER during initial sync for existing room occupants
      if (!knownMemberIdsRef.current.has(uid) && uid !== me.current) {
        knownMemberIdsRef.current.add(uid);
        if (!isFirstSync) {
          notifyMemberEvent("join", uid, memberNick);
        }
      }
    });

    // 2. Retain members who may be briefly tab-switched or backgrounded
    knownMembersCacheRef.current.forEach((cachedMember, uid) => {
      if (explicitlyLeftRef.current.has(uid)) {
        knownMembersCacheRef.current.delete(uid);
        return;
      }

      if (!rosterMap.has(uid)) {
        // Keep in roster for at least 75 seconds if tab switched or backgrounded
        if (cachedMember.lastSeen !== undefined && now - cachedMember.lastSeen < 75000) {
          rosterMap.set(uid, { ...cachedMember, state: "active" });
        } else {
          // Expiry after prolonged disappearance without explicit leave
          knownMembersCacheRef.current.delete(uid);
          knownMemberIdsRef.current.delete(uid);
          const rawNick = String(cachedMember.nickname || "").trim();
          const cleanNick = rawNick && rawNick !== "false" && rawNick !== "undefined" ? rawNick : "A member";
          notifyMemberEvent("leave", uid, cleanNick);
        }
      }
    });

    // 3. Always guarantee local user is in roster
    if (!rosterMap.has(me.current)) {
      const localRole: MemberRole = statusRef.current === "hosting" ? "owner" : myRole;
      const rawLocalNick = String(savedNickname() || nickname || "").trim();
      const localNick = rawLocalNick && rawLocalNick !== "false" ? rawLocalNick : "Guest";
      rosterMap.set(me.current, {
        id: me.current,
        nickname: localNick,
        name: localNick,
        role: localRole,
        at: now,
        joinedAt: now,
        state: "active",
        lastSeen: now,
      });
    }

    const combined = Array.from(rosterMap.values());
    combined.sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.role === "host" ? -1 : b.role === "host" ? 1 : a.at - b.at));
    setMembers(combined);
  }, [myRole, nickname, notifyMemberEvent]);

  /* ---------- broadcast typing state ---------- */
  const sendTyping = useCallback((isTyping: boolean) => {
    const ch = chatChanRef.current || chanRef.current;
    if (!ch) return;
    const now = Date.now();
    if (isTyping) {
      if (now - lastTypingSentRef.current < 2000) return;
      lastTypingSentRef.current = now;
    } else {
      lastTypingSentRef.current = 0;
    }
    const effectiveNick = savedNickname() || nickname || "Guest";
    ch.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: me.current, nickname: effectiveNick, typing: isTyping },
    }).catch(() => {});
  }, [nickname]);

  /* ---------- typing indicators auto-decay timer ---------- */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      typingMapRef.current.forEach((val, uid) => {
        if (now > val.until) {
          typingMapRef.current.delete(uid);
          changed = true;
        }
      });
      if (changed) {
        setTypingUsers(Array.from(typingMapRef.current.values()).map((v) => v.nickname));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  /* ---------- wire the members channel (partitioned for load balancing) ---------- */
  const bindRoomChannel = useCallback(
    (code: string, role: "host" | "member", info: RoomInfo) => {
      hasCompletedInitialSyncRef.current = false;
      if (chanRef.current) {
        supabase.removeChannel(chanRef.current);
        chanRef.current = null;
      }
      if (chatChanRef.current) {
        supabase.removeChannel(chatChanRef.current);
        chatChanRef.current = null;
      }
      if (syncChanRef.current) {
        supabase.removeChannel(syncChanRef.current);
        syncChanRef.current = null;
      }

      /* 1. Dedicated Presence & Room Lifecycle Channel */
      const ch = supabase.channel(roomChannel(code), {
        config: { presence: { key: me.current }, broadcast: { self: false } },
      });
      chanRef.current = ch;

      /* 2. Dedicated Live Chat Channel */
      const chatCh = supabase.channel(roomChatChannel(code), {
        config: { broadcast: { self: false } },
      });
      chatChanRef.current = chatCh;

      /* 3. Dedicated Music Playback & Queue Sync Channel */
      const syncCh = supabase.channel(roomSyncChannel(code), {
        config: { broadcast: { self: false } },
      });
      syncChanRef.current = syncCh;

      // Presence events - sync roster safely without false leave spam
      ch.on("presence", { event: "sync" }, () => syncMembers(ch));
      ch.on("presence", { event: "join" }, () => syncMembers(ch));
      ch.on("presence", { event: "leave" }, () => syncMembers(ch));

      // Synchronize state & missed chats on demand
      ch.on("broadcast", { event: "state_request" }, ({ payload }) => {
        const pb = hRef.current.getPlayback();
        const q = hRef.current.getQueue?.() || [];
        const isCurrentHost = roomRef.current?.hostId === me.current || statusRef.current === "hosting";

        ch.send({
          type: "broadcast",
          event: "sync_state",
          payload: {
            to: payload?.userId,
            playback: isCurrentHost && pb ? { ...pb, ts: Date.now(), by: me.current } : null,
            permissions: isCurrentHost ? permRef.current : null,
            room: isCurrentHost ? roomRef.current : null,
            queue: isCurrentHost ? q : null,
            chat: (chatRef.current || []).slice(-100),
          },
        }).catch(() => {});
      });

      ch.on("broadcast", { event: "sync_state" }, ({ payload }) => {
        if (payload?.to && payload.to !== me.current) return;
        if (payload?.room) {
          setRoom(payload.room);
          roomRef.current = payload.room;
        }
        if (payload?.permissions) setPermissions(payload.permissions);
        if (Array.isArray(payload?.queue) && payload.queue.length > 0) {
          hRef.current.applyQueue?.(payload.queue);
        }
        if (payload?.playback) hRef.current.applyPlayback(payload.playback as PlaybackState);
        if (Array.isArray(payload?.chat) && payload.chat.length > 0) {
          setChat((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const newItems = payload.chat
              .filter((c: any) => c && c.id && !existingIds.has(c.id))
              .map((c: any) => ({ ...c, mine: c.userId === me.current }));
            if (newItems.length === 0) return prev;
            const merged = [...prev, ...newItems];
            merged.sort((a, b) => (a.ts || 0) - (b.ts || 0));
            const sliced = merged.slice(-120);
            chatRef.current = sliced;
            return sliced;
          });
        }
      });

      // Host transfer listener
      ch.on("broadcast", { event: "host_transfer" }, ({ payload }) => {
        const wasHost = roomRef.current?.hostId === me.current;
        const newHostNick = payload.newHostName || "Host";
        const newRoomName = payload.roomName || `${newHostNick}'s Room`;
        setRoom((r) => (r ? { ...r, hostId: payload.newHostId, hostName: newHostNick, name: newRoomName } : r));
        if (roomRef.current) {
          roomRef.current.hostId = payload.newHostId;
          roomRef.current.hostName = newHostNick;
          roomRef.current.name = newRoomName;
        }
        const iAmNewHost = payload.newHostId === me.current;
        setStatus(iAmNewHost ? "hosting" : "member");
        if (!iAmNewHost && wasHost) {
          window.clearInterval(beatRef.current);
          announceDirectory(null);
        }
        if (iAmNewHost) {
          ch.track({ id: me.current, nickname: savedNickname() || newHostNick || "Host", role: "owner", at: Date.now() }).catch(() => {});
          window.clearInterval(beatRef.current);
          beatRef.current = window.setInterval(pushPlayback, HEARTBEAT_MS);
          if (roomRef.current) {
            setupHostLobby(roomRef.current.code, roomRef.current);
            if (roomRef.current.type === "public") {
              announceDirectory({
                code: roomRef.current.code,
                name: newRoomName,
                hostName: newHostNick,
                count: Math.max(1, members.length),
                requireApproval: roomRef.current.requireApproval,
                at: Date.now(),
              });
            }
          }
          const sysPromote = systemMsg("👑 You have been promoted to Room Host!");
          setChat((prev) => [...prev, sysPromote].slice(-120));
          hRef.current.onToast?.("👑 You have been promoted to Room Host!");
        } else {
          const sysTransfer = systemMsg(`👑 ${newHostNick} is now the Host`);
          setChat((prev) => [...prev, sysTransfer].slice(-120));
          hRef.current.onToast?.(`👑 ${newHostNick} is now the Host`);
        }
      });

      ch.on("broadcast", { event: "member_rename" }, ({ payload }) => {
        if (!payload?.userId || !payload?.newNickname) return;
        const uid = payload.userId;
        const cleanNew = String(payload.newNickname).trim().slice(0, 24);
        if (!cleanNew || cleanNew === "false" || cleanNew === "null" || cleanNew === "undefined") return;
        const oldNick = payload.oldNickname || knownMembersCacheRef.current.get(uid)?.nickname || "A member";

        const cached = knownMembersCacheRef.current.get(uid);
        if (cached) {
          cached.nickname = cleanNew;
          cached.name = cleanNew;
        }

        setMembers((prev) =>
          prev.map((m) => (m.id === uid ? { ...m, nickname: cleanNew, name: cleanNew } : m))
        );

        if (roomRef.current && roomRef.current.hostId === uid) {
          roomRef.current.hostName = cleanNew;
          setRoom((r) => (r ? { ...r, hostName: cleanNew } : r));
        }

        if (oldNick && oldNick !== cleanNew && oldNick !== "A member") {
          const text = `${oldNick} is now known as ${cleanNew}`;
          hRef.current.onToast?.(text);
          const sys = systemMsg(text);
          setChat((prev) => [...prev, sys].slice(-120));
        }
      });

      ch.on("broadcast", { event: "member_joined" }, ({ payload }) => {
        if (payload?.id && payload.id !== me.current) {
          explicitlyLeftRef.current.delete(payload.id);
          const rawNick = String(payload.nickname || "").trim();
          const cleanNick = rawNick && rawNick !== "false" && rawNick !== "null" ? rawNick : "A listener";

          const existing = knownMembersCacheRef.current.get(payload.id);
          if (existing) {
            existing.nickname = cleanNick;
            existing.name = cleanNick;
          }

          if (!knownMemberIdsRef.current.has(payload.id)) {
            knownMemberIdsRef.current.add(payload.id);
            notifyMemberEvent("join", payload.id, cleanNick);
          }
        }
        syncMembers(ch);
      });

      ch.on("broadcast", { event: "member_left" }, ({ payload }) => {
        if (payload?.userId && payload.userId !== me.current) {
          const uid = payload.userId;
          const left = knownMembersCacheRef.current.get(uid) || membersRef.current.find((m) => m.id === uid);
          const rawLeftName = String(payload.nickname || left?.nickname || "").trim();
          const leftName =
            rawLeftName && rawLeftName !== "false" && rawLeftName !== "undefined" && rawLeftName !== "null"
              ? rawLeftName
              : "A member";

          explicitlyLeftRef.current.set(uid, Date.now());
          knownMembersCacheRef.current.delete(uid);
          knownMemberIdsRef.current.delete(uid);

          setMembers((prev) => prev.filter((m) => m.id !== uid));
          notifyMemberEvent("leave", uid, leftName);
        }
        syncMembers(ch);
      });

      ch.on("broadcast", { event: "kick" }, ({ payload }) => {
        if (payload.userId === me.current) {
          clearRoomSession();
          teardown();
          setStatus("denied");
          setRoom(null);
          setMembers([]);
          setChat([]);
        }
      });

      ch.on("broadcast", { event: "room_closed" }, () => {
        if (roomRef.current?.hostId === me.current) return;
        clearRoomSession();
        teardown();
        setStatus("closed");
        setRoom(null);
        setMembers([]);
        setChat([]);
        setRequests([]);
      });

      ch.on("broadcast", { event: "voice_toggle" }, ({ payload }) => {
        setRoom((r) => (r ? { ...r, voiceEnabled: payload.voiceEnabled } : r));
        if (roomRef.current) roomRef.current.voiceEnabled = payload.voiceEnabled;
      });

      ch.on("broadcast", { event: "member_role" }, ({ payload }) => {
        setMembers((prev) =>
          prev.map((m) => (m.id === payload.userId ? { ...m, role: payload.role } : m))
        );
        if (payload.userId === me.current) {
          ch.track({
            id: me.current,
            nickname: savedNickname() || "Guest",
            role: payload.role,
            state: "active",
            at: Date.now(),
          }).catch(() => {});
        }
      });

      /* Wire Chat Channel Events */
      chatCh.on("broadcast", { event: "chat" }, ({ payload }) => {
        const m = payload as ChatMsg;
        if (!m || !m.id) return;
        setChat((prev) => {
          if (prev.some((c) => c.id === m.id)) return prev;
          const updated = [...prev, { ...m, mine: m.userId === me.current }].slice(-120);
          chatRef.current = updated;
          return updated;
        });
        if (m.userId !== me.current) {
          if (roomRef.current) {
            notifyChatMessage(m, roomRef.current.name);
          }
          // Remove typing indicator on receive
          typingMapRef.current.delete(m.userId);
          setTypingUsers(Array.from(typingMapRef.current.values()).map((v) => v.nickname));

          // Send receipt back to author: if tab is visible, mark as read immediately
          const isRead = document.visibilityState === "visible";
          chatCh.send({
            type: "broadcast",
            event: "chat_ack",
            payload: {
              msgId: m.id,
              readerId: me.current,
              status: isRead ? "read" : "delivered",
            },
          }).catch(() => {});
        }
      });

      chatCh.on("broadcast", { event: "chat_ack" }, ({ payload }) => {
        if (!payload) return;
        const targetIds = new Set<string>();
        if (payload.msgId) targetIds.add(payload.msgId);
        if (Array.isArray(payload.msgIds)) {
          payload.msgIds.forEach((id: string) => targetIds.add(id));
        }
        if (targetIds.size === 0) return;

        const incomingStatus = payload.status === "read" ? "read" : "delivered";

        setChat((prev) => {
          let hasChange = false;
          const updated = prev.map((c) => {
            if (targetIds.has(c.id) && c.mine) {
              if (c.status === "read" && incomingStatus === "delivered") {
                return c; // Never downgrade "read" to "delivered"
              }
              if (c.status !== incomingStatus) {
                hasChange = true;
                return { ...c, status: incomingStatus as any };
              }
            }
            return c;
          });
          if (hasChange) {
            chatRef.current = updated;
            return updated;
          }
          return prev;
        });
      });

      chatCh.on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.userId === me.current) return;
        const now = Date.now();
        if (payload.typing) {
          typingMapRef.current.set(payload.userId, { nickname: payload.nickname || "Someone", until: now + 3500 });
        } else {
          typingMapRef.current.delete(payload.userId);
        }
        setTypingUsers(Array.from(typingMapRef.current.values()).map((v) => v.nickname));
      });

      chatCh.on("broadcast", { event: "chat_delete" }, ({ payload }) => {
        setChat((prev) => prev.filter((c) => c.id !== payload.id));
      });
      chatCh.on("broadcast", { event: "chat_clear" }, () => setChat([]));
      chatCh.on("broadcast", { event: "chat_toggle" }, ({ payload }) => {
        setRoom((r) => (r ? { ...r, chatEnabled: payload.enabled } : r));
        if (roomRef.current) roomRef.current.chatEnabled = payload.enabled;
      });

      /* Wire Music Playback & Queue Channel Events */
      syncCh.on("broadcast", { event: "playback" }, ({ payload }) => {
        const pb = payload as PlaybackState;
        if (pb.by === me.current) return;
        hRef.current.applyPlayback(pb);
      });

      syncCh.on("broadcast", { event: "queue_add" }, ({ payload }) => {
        if (roomRef.current?.hostId !== me.current && statusRef.current !== "hosting") return;
        const currentQueue = hRef.current.getQueue?.() || [];
        const incomingTrack = payload.track;
        if (!incomingTrack) return;
        const exists = currentQueue.some((t: any) => t.id === incomingTrack.id || t.videoId === incomingTrack.videoId);
        if (!exists) {
          const newQueue = [...currentQueue, incomingTrack];
          hRef.current.applyQueue?.(newQueue);
          syncCh.send({
            type: "broadcast",
            event: "queue_update",
            payload: newQueue,
          }).catch(() => {});
        }
      });

      syncCh.on("broadcast", { event: "queue_update" }, ({ payload }) => {
        if (roomRef.current?.hostId === me.current || statusRef.current === "hosting") return;
        if (Array.isArray(payload)) {
          hRef.current.applyQueue?.(payload);
        }
      });

      syncCh.on("broadcast", { event: "pause_all" }, () => {
        hRef.current.applyPlayback({
          videoId: "",
          title: "",
          artist: "",
          thumb: "",
          isPlaying: false,
          position: 0,
          ts: Date.now(),
          by: "__system__",
        });
      });

      ch.on("broadcast", { event: "permissions" }, ({ payload }) => {
        const next = payload as Permissions;
        setPermissions(next);
        permRef.current = next;
      });

      // Subscribe all channels with error recovery
      chatCh.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          flushPendingChatQueue();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          window.setTimeout(() => {
            try {
              chatCh.subscribe();
            } catch {}
          }, 1500);
        }
      });

      syncCh.subscribe((s) => {
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          window.setTimeout(() => {
            try {
              syncCh.subscribe();
            } catch {}
          }, 1500);
        }
      });

      ch.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setActiveChannel(ch);
          setConnection("connected");
          const myNick = savedNickname() || nickname || "Guest";
          ch.track({
            id: me.current,
            nickname: myNick,
            role,
            state: "active",
            at: Date.now(),
          }).catch(() => {});
          ch.send({
            type: "broadcast",
            event: "member_joined",
            payload: { id: me.current, nickname: myNick, role },
          }).catch(() => {});
          syncMembers(ch);
          requestNotificationPermission();

          // Flush any queued pending chat messages
          flushPendingChatQueue();

          if (role === "member") {
            window.setTimeout(() => {
              ch.send({ type: "broadcast", event: "state_request", payload: { userId: me.current } }).catch(() => {});
            }, 100);
          } else {
            window.clearInterval(beatRef.current);
            beatRef.current = window.setInterval(pushPlayback, HEARTBEAT_MS);
            if (info.type === "public") {
              announceDirectory({
                code: info.code,
                name: info.name,
                hostName: info.hostName,
                count: Math.max(1, membersRef.current?.length || 1),
                requireApproval: info.requireApproval,
                at: Date.now(),
              });
            }
          }
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setConnection("reconnecting");
          // Re-subscribe on channel error
          window.setTimeout(() => {
            try {
              ch.subscribe();
            } catch {}
          }, 1500);
        } else if (s === "CLOSED") {
          setConnection((c) => (statusRef.current === "idle" ? "offline" : c));
        }
      });

      return ch;
    },
    [announceDirectory, flushPendingChatQueue, pushPlayback, setupHostLobby, syncMembers, teardown]
  );

  /* ---------- create room ---------- */
  const createRoom = useCallback(
    (opts: CreateOpts) => {
      const nick = (opts.nickname || nickname || savedNickname() || "").trim();
      if (!nick) {
        hRef.current.onToast?.("Please enter your name first!");
        return null;
      }
      saveNickname(nick);
      setNickname(nick);

      teardown();
      const code = genRoomCode();
      const info: RoomInfo = {
        code,
        name: opts.name.trim() || `${nick}'s Room`,
        type: opts.type,
        requireApproval: opts.type === "private" ? true : opts.requireApproval,
        hostId: me.current,
        hostName: nick,
        chatEnabled: opts.chatEnabled ?? true,
        voiceEnabled: opts.voiceEnabled ?? true,
      };
      setRoom(info);
      roomRef.current = info;
      const perms = opts.type === "public" && opts.control === "shared" ? SHARED_PERMS : HOST_ONLY_PERMS;
      setPermissions(perms);
      permRef.current = perms;
      setChat([]);
      setRequests([]);
      setStatus("hosting");

      setupHostLobby(code, info);
      bindRoomChannel(code, "host", info);

      if (info.type === "public") {
        announceDirectory({
          code: info.code,
          name: info.name,
          hostName: info.hostName,
          count: 1,
          requireApproval: info.requireApproval,
          at: Date.now(),
        });
      }
      return info;
    },
    [announceDirectory, bindRoomChannel, nickname, setupHostLobby, teardown]
  );

  /* ---------- join room ---------- */
  const joinRoom = useCallback(
    (code: string, nick: string, isRecovery = false) => {
      const clean = code.trim().toUpperCase();
      if (!clean) {
        hRef.current.onToast?.("Please enter a room code");
        return false;
      }
      const effectiveNick = (nick || nickname || savedNickname() || "").trim();
      if (!effectiveNick && !isRecovery) {
        hRef.current.onToast?.("Please enter your name first!");
        return false;
      }
      const finalNick = effectiveNick || "Guest";
      saveNickname(finalNick);
      setNickname(finalNick);

      teardown();
      setChat([]);

      const knownPublic = publicRooms.find((r) => r.code === clean) || publicRoomsCacheRef.current.get(clean);
      if (knownPublic && !knownPublic.requireApproval) {
        const info: RoomInfo = {
          code: clean,
          name: knownPublic.name,
          type: "public",
          requireApproval: false,
          hostId: "",
          hostName: knownPublic.hostName,
          chatEnabled: true,
          voiceEnabled: true,
        };
        setRoom(info);
        roomRef.current = info;
        setStatus("member");
        bindRoomChannel(clean, "member", info);
        return true;
      }

      setStatus(isRecovery ? "waiting" : "requesting");

      if (isRecovery) {
        const dummyInfo: RoomInfo = {
          code: clean,
          name: `${clean} Room`,
          type: "public",
          requireApproval: false,
          hostId: "",
          hostName: "Host",
          chatEnabled: true,
          voiceEnabled: true,
        };
        bindRoomChannel(clean, "member", dummyInfo);
      }

      const lob = supabase.channel(lobbyChannel(clean), {
        config: { broadcast: { self: false }, presence: { key: me.current } },
      });
      lobbyRef.current = lob;

      let resolved = false;
      let ackd = false;

      const tryHostPresence = (): boolean => {
        const state = lob.presenceState() as Record<string, any[]>;
        for (const metas of Object.values(state)) {
          const m = (metas?.[0] ?? {}) as any;
          if (m?.role === "host" && m?.room) {
            ackd = true;
            const info: RoomInfo = m.room;
            if (info.type === "public" && !info.requireApproval) {
              resolved = true;
              setRoom(info);
              roomRef.current = info;
              if (m.permissions) setPermissions(m.permissions);
              setStatus("member");
              bindRoomChannel(clean, "member", info);
            }
            return true;
          }
        }
        return false;
      };

      lob.on("presence", { event: "sync" }, () => {
        if (!resolved) tryHostPresence();
      });
      lob.on("presence", { event: "join" }, () => {
        if (!resolved) tryHostPresence();
      });

      lob.on("broadcast", { event: "join_ack" }, ({ payload }) => {
        if (payload.userId === me.current) ackd = true;
      });
      lob.on("broadcast", { event: "join_response" }, ({ payload }) => {
        if (payload.userId !== me.current) return;
        resolved = true;
        if (payload.approved) {
          const info: RoomInfo = payload.room;
          setRoom(info);
          roomRef.current = info;
          if (payload.permissions) setPermissions(payload.permissions);
          setStatus("member");
          bindRoomChannel(clean, "member", info);
        } else {
          clearRoomSession();
          setStatus("denied");
          teardown();
        }
      });

      const sendReq = () =>
        lob.send({
          type: "broadcast",
          event: "join_request",
          payload: { userId: me.current, nickname: finalNick, at: Date.now() } as JoinRequest,
        }).catch(() => {});

      lob.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setConnection("connected");
          if (!isRecovery) setStatus("waiting");
          lob.track({ role: "member", nickname: finalNick, at: Date.now(), sessionId: tabSessionId.current }).catch(() => {});
          const admitted = tryHostPresence();
          if (!admitted) {
            sendReq();
            [900, 2400, 5000, 8500, 12000].forEach((delay) => {
              joinTimersRef.current.push(
                window.setTimeout(() => !resolved && (tryHostPresence() || sendReq()), delay)
              );
            });
          }
          if (!isRecovery) {
            joinTimersRef.current.push(
              window.setTimeout(() => {
                if (!resolved && !ackd && (statusRef.current === "waiting" || statusRef.current === "requesting")) {
                  setStatus("error");
                  teardown();
                }
              }, 18000)
            );
          }
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setConnection("reconnecting");
        }
      });
      return true;
    },
    [bindRoomChannel, nickname, publicRooms, teardown]
  );

  /* ---------- host: approve / reject ---------- */
  const approve = useCallback((uid: string) => {
    const lob = lobbyRef.current;
    if (!lob || !roomRef.current) return;
    lob.send({
      type: "broadcast",
      event: "join_response",
      payload: { userId: uid, approved: true, room: roomRef.current, permissions: permRef.current },
    }).catch(() => {});
    setRequests((prev) => prev.filter((r) => r.userId !== uid));
  }, []);

  const reject = useCallback((uid: string) => {
    const lob = lobbyRef.current;
    lob?.send({ type: "broadcast", event: "join_response", payload: { userId: uid, approved: false } }).catch(() => {});
    setRequests((prev) => prev.filter((r) => r.userId !== uid));
  }, []);

  /* ---------- Live Chat with Delivery Status & Retry ---------- */
  const sendChat = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      sendTyping(false);
      backgroundKeepAlive.ensureAudio();
      const effectiveNick = savedNickname() || nickname || "Guest";
      const msgId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const msg: ChatMsg = {
        id: msgId,
        userId: me.current,
        nickname: effectiveNick,
        message: t.slice(0, 400),
        ts: Date.now(),
        status: "sending",
      };

      // Optimistic addition with deduplication
      const nextChat = chatRef.current.some((c) => c.id === msg.id)
        ? chatRef.current
        : [...chatRef.current, { ...msg, mine: true }].slice(-120);
      chatRef.current = nextChat;
      setChat(nextChat);

      const ch = chatChanRef.current || chanRef.current;
      if (ch) {
        ch.send({ type: "broadcast", event: "chat", payload: msg })
          .then((resp) => {
            if (resp === "ok") {
              setChat((prev) =>
                prev.map((c) => (c.id === msgId && c.status === "sending" ? { ...c, status: "sent" } : c))
              );
            } else {
              setChat((prev) =>
                prev.map((c) => (c.id === msgId ? { ...c, status: "failed" } : c))
              );
              if (!pendingChatQueue.current.some((p) => p.id === msg.id)) {
                pendingChatQueue.current.push(msg);
              }
            }
          })
          .catch((err) => {
            console.warn("[RoomChat] send error, queueing:", err);
            setChat((prev) =>
              prev.map((c) => (c.id === msgId ? { ...c, status: "failed" } : c))
            );
            if (!pendingChatQueue.current.some((p) => p.id === msg.id)) {
              pendingChatQueue.current.push(msg);
            }
          });
      } else {
        setChat((prev) =>
          prev.map((c) => (c.id === msgId ? { ...c, status: "failed" } : c))
        );
        if (!pendingChatQueue.current.some((p) => p.id === msg.id)) {
          pendingChatQueue.current.push(msg);
        }
      }
    },
    [nickname, sendTyping]
  );

  const retryChat = useCallback((id: string) => {
    const target = chatRef.current.find((c) => c.id === id);
    if (!target) return;
    setChat((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "sending" } : c))
    );
    const ch = chatChanRef.current || chanRef.current;
    if (ch) {
      ch.send({ type: "broadcast", event: "chat", payload: target })
        .then((resp) => {
          if (resp === "ok") {
            setChat((prev) =>
              prev.map((c) => (c.id === id && c.status === "sending" ? { ...c, status: "sent" } : c))
            );
          } else {
            setChat((prev) =>
              prev.map((c) => (c.id === id ? { ...c, status: "failed" } : c))
            );
          }
        })
        .catch(() => {
          setChat((prev) =>
            prev.map((c) => (c.id === id ? { ...c, status: "failed" } : c))
          );
        });
    }
  }, []);

  const deleteChat = useCallback((id: string) => {
    const ch = chatChanRef.current || chanRef.current;
    ch?.send({ type: "broadcast", event: "chat_delete", payload: { id } }).catch(() => {});
    setChat((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearChat = useCallback(() => {
    const ch = chatChanRef.current || chanRef.current;
    ch?.send({ type: "broadcast", event: "chat_clear", payload: {} }).catch(() => {});
    setChat([]);
  }, []);

  const setChatEnabled = useCallback((on: boolean) => {
    setRoom((r) => (r ? { ...r, chatEnabled: on } : r));
    if (roomRef.current) roomRef.current.chatEnabled = on;
    const ch = chatChanRef.current || chanRef.current;
    ch?.send({ type: "broadcast", event: "chat_toggle", payload: { enabled: on } }).catch(() => {});
  }, []);

  const markChatAsRead = useCallback(() => {
    const ch = chatChanRef.current || chanRef.current;
    if (!ch) return;
    const incoming = chatRef.current.filter((c) => c.userId !== me.current);
    if (incoming.length === 0) return;
    const unreadIds = incoming.map((c) => c.id);
    ch.send({
      type: "broadcast",
      event: "chat_ack",
      payload: {
        msgIds: unreadIds,
        readerId: me.current,
        status: "read",
      },
    }).catch(() => {});
  }, []);

  /* ---------- host controls ---------- */
  const updatePermissions = useCallback((next: Permissions) => {
    setPermissions(next);
    permRef.current = next;
    chanRef.current?.send({ type: "broadcast", event: "permissions", payload: next }).catch(() => {});
  }, []);

  const transferHost = useCallback((uid: string) => {
    const target = members.find((m) => m.id === uid);
    if (!target || !roomRef.current) return;
    const targetNick = target.nickname || "Host";
    const newRoomName = `${targetNick}'s Room`;
    chanRef.current?.send({
      type: "broadcast",
      event: "host_transfer",
      payload: { newHostId: uid, newHostName: targetNick, roomName: newRoomName },
    }).catch(() => {});
    setRoom((r) => (r ? { ...r, hostId: uid, hostName: targetNick, name: newRoomName } : r));
    if (roomRef.current) {
      roomRef.current.hostId = uid;
      roomRef.current.hostName = targetNick;
      roomRef.current.name = newRoomName;
    }
    setStatus("member");
    window.clearInterval(beatRef.current);
    announceDirectory(null);
  }, [members, announceDirectory]);

  const kick = useCallback((uid: string, ban = false) => {
    if (uid === roomRef.current?.hostId) return;
    if (ban) {
      banRef.current.add(uid);
      if (banRef.current.size > 100) {
        const first = banRef.current.values().next().value;
        if (first) banRef.current.delete(first);
      }
    }
    const kicked = members.find((m) => m.id === uid);
    const kickedName = kicked?.nickname || "Member";
    chanRef.current?.send({ type: "broadcast", event: "kick", payload: { userId: uid } }).catch(() => {});
    const sysKick = systemMsg(`${kickedName} was removed from the room`);
    const chatCh = chatChanRef.current || chanRef.current;
    chatCh?.send({ type: "broadcast", event: "chat", payload: sysKick }).catch(() => {});
    setMembers((prev) => prev.filter((m) => m.id !== uid));
  }, [members]);

  const promoteToHost = useCallback((targetUid: string) => {
    if (roomRef.current?.hostId !== me.current) return;
    if (targetUid === me.current) return;
    const target = members.find((m) => m.id === targetUid);
    if (!target) return;
    chanRef.current?.send({
      type: "broadcast",
      event: "member_role",
      payload: { userId: targetUid, role: "host" },
    }).catch(() => {});
    setMembers((prev) =>
      prev.map((m) => (m.id === targetUid ? { ...m, role: "host" } : m))
    );
    const sysMsg = systemMsg(`${target.nickname} was promoted to Co-Host`);
    const chatCh = chatChanRef.current || chanRef.current;
    chatCh?.send({ type: "broadcast", event: "chat", payload: sysMsg }).catch(() => {});
    setChat((prev) => [...prev, sysMsg].slice(-120));
  }, [members]);

  const demoteHost = useCallback((targetUid: string) => {
    if (roomRef.current?.hostId !== me.current) return;
    if (targetUid === roomRef.current?.hostId) return;
    const target = members.find((m) => m.id === targetUid);
    if (!target) return;
    chanRef.current?.send({
      type: "broadcast",
      event: "member_role",
      payload: { userId: targetUid, role: "member" },
    }).catch(() => {});
    setMembers((prev) =>
      prev.map((m) => (m.id === targetUid ? { ...m, role: "member" } : m))
    );
    const sysMsg = systemMsg(`${target.nickname} was demoted to Member`);
    const chatCh = chatChanRef.current || chanRef.current;
    chatCh?.send({ type: "broadcast", event: "chat", payload: sysMsg }).catch(() => {});
    setChat((prev) => [...prev, sysMsg].slice(-120));
  }, [members]);

  const toggleVoiceEnabled = useCallback((on: boolean) => {
    if (!isHost && myRole !== "owner") return;
    setRoom((r) => (r ? { ...r, voiceEnabled: on } : r));
    if (roomRef.current) roomRef.current.voiceEnabled = on;
    chanRef.current?.send({ type: "broadcast", event: "voice_toggle", payload: { voiceEnabled: on } }).catch(() => {});
    const sysMsg = systemMsg(`Voice was ${on ? "enabled" : "disabled"} by ${isOwner ? "Owner" : "Host"}`);
    const chatCh = chatChanRef.current || chanRef.current;
    chatCh?.send({ type: "broadcast", event: "chat", payload: sysMsg }).catch(() => {});
    setChat((prev) => [...prev, sysMsg].slice(-120));
  }, [isHost, myRole, isOwner]);

  const closeRoom = useCallback(() => {
    syncChanRef.current?.send({ type: "broadcast", event: "pause_all", payload: {} }).catch(() => {});
    chanRef.current?.send({ type: "broadcast", event: "pause_all", payload: {} }).catch(() => {});
    const sysClose = systemMsg("Room closed by host");
    const chatCh = chatChanRef.current || chanRef.current;
    chatCh?.send({ type: "broadcast", event: "chat", payload: sysClose }).catch(() => {});
    chanRef.current?.send({ type: "broadcast", event: "room_closed", payload: {} }).catch(() => {});
    announceDirectory(null);
    clearRoomSession();
    teardown();
    setStatus("idle");
    setRoom(null);
    setMembers([]);
    setChat([]);
    setRequests([]);
  }, [announceDirectory, teardown]);

  const leave = useCallback(() => {
    const wasHost = roomRef.current?.hostId === me.current;
    const membersList = members.filter((m) => m.id !== me.current);
    const rawNick = String(nickname || savedNickname() || "").trim();
    const myNick = rawNick && rawNick !== "false" ? rawNick : "Guest";

    chanRef.current?.send({
      type: "broadcast",
      event: "member_left",
      payload: { userId: me.current, nickname: myNick },
    }).catch(() => {});
    chanRef.current?.untrack().catch(() => {});

    if (wasHost && membersList.length > 0) {
      const coHosts = membersList.filter((m) => m.role === "host").sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
      const regular = membersList.filter((m) => m.role !== "host").sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
      const newHost = coHosts[0] || regular[0];
      const newHostNick = newHost.nickname || "Host";
      const updatedRoomName = `${newHostNick}'s Room`;

      const transferPayload = {
        newHostId: newHost.id,
        newHostName: newHostNick,
        roomName: updatedRoomName,
      };
      chanRef.current?.send({ type: "broadcast", event: "host_transfer", payload: transferPayload }).catch(() => {});
      const sysTransfer = systemMsg(`${newHostNick} is now the host`);
      const chatCh = chatChanRef.current || chanRef.current;
      chatCh?.send({ type: "broadcast", event: "chat", payload: sysTransfer }).catch(() => {});
      setRoom((r) => (r ? { ...r, hostId: newHost.id, hostName: newHostNick, name: updatedRoomName } : r));
      if (roomRef.current) {
        roomRef.current.hostId = newHost.id;
        roomRef.current.hostName = newHostNick;
        roomRef.current.name = updatedRoomName;
      }
    } else if (wasHost && membersList.length === 0) {
      syncChanRef.current?.send({ type: "broadcast", event: "pause_all", payload: {} }).catch(() => {});
      chanRef.current?.send({ type: "broadcast", event: "pause_all", payload: {} }).catch(() => {});
      chanRef.current?.send({ type: "broadcast", event: "room_closed", payload: {} }).catch(() => {});
    }

    announceDirectory(null);
    clearRoomSession();

    teardown();
    setStatus("idle");
    setRoom(null);
    setMembers([]);
    setChat([]);
    setRequests([]);
    setConnection("offline");
  }, [announceDirectory, teardown, members, nickname]);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setRoom(null);
  }, []);

  const updateNickname = useCallback((n: string) => {
    const clean = String(n || "").trim().slice(0, 24);
    if (!clean || clean === "false" || clean === "null" || clean === "undefined") {
      return;
    }
    const oldNick = nickname;
    if (clean === oldNick) return;

    saveNickname(clean);
    setNickname(clean);

    setMembers((prev) =>
      prev.map((m) => (m.id === me.current ? { ...m, nickname: clean, name: clean } : m))
    );

    const cached = knownMembersCacheRef.current.get(me.current);
    if (cached) {
      cached.nickname = clean;
      cached.name = clean;
    }

    if (statusRef.current === "hosting" && roomRef.current) {
      roomRef.current.hostName = clean;
      setRoom((r) => (r ? { ...r, hostName: clean } : r));
    }

    const ch = chanRef.current;
    if (ch && (statusRef.current === "hosting" || statusRef.current === "member")) {
      ch.send({
        type: "broadcast",
        event: "member_rename",
        payload: { userId: me.current, oldNickname: oldNick, newNickname: clean },
      }).catch(() => {});

      ch.track({
        id: me.current,
        nickname: clean,
        role: statusRef.current === "hosting" ? "owner" : myRole,
        state: "active",
        at: Date.now(),
      }).catch(() => {});
    }
  }, [myRole, nickname]);

  // Host keeps directory count in sync
  useEffect(() => {
    const r = roomRef.current;
    if (status === "hosting" && r && r.type === "public" && r.hostId === me.current) {
      announceDirectory({
        code: r.code,
        name: r.name,
        hostName: r.hostName,
        count: Math.max(1, members.length),
        requireApproval: r.requireApproval,
        at: Date.now(),
      });
    }
  }, [status, members.length, room?.name, room?.hostName, room?.hostId, announceDirectory]);

  // Tab keepalive lease
  useEffect(() => {
    if (status === "hosting" || status === "member") {
      const release = backgroundKeepAlive.acquire();
      return release;
    }
  }, [status]);

  // Proactive Supabase Realtime connection watchdog
  useEffect(() => {
    if (status === "idle") return;
    const unregister = backgroundKeepAlive.onSupabaseCheck(() => {
      const rt = supabase.realtime as any;
      const wsState =
        rt?.conn?.readyState ??
        rt?.socket?.readyState ??
        (typeof rt?.isConnected === "function" ? (rt.isConnected() ? 1 : 3) : undefined);

      if (wsState === 3 /* CLOSED */ || wsState === 2 /* CLOSING */) {
        try {
          rt?.connect?.();
        } catch {}
      }

      [chanRef.current, chatChanRef.current, syncChanRef.current].forEach((ch) => {
        if (ch && (ch.state === "closed" || ch.state === "errored")) {
          try {
            ch.subscribe();
          } catch {}
        }
      });
      flushPendingChatQueue();
    });
    return unregister;
  }, [status, flushPendingChatQueue]);

  // Host playback periodic push
  useEffect(() => {
    if (status !== "hosting") return;
    const unbind = backgroundKeepAlive.onTick(() => {
      if (statusRef.current === "hosting") {
        pushPlayback();
      }
    });
    return unbind;
  }, [status, pushPlayback]);

  // Resilient tab-switching & visibility recovery
  useEffect(() => {
    const handleReSync = () => {
      backgroundKeepAlive.ensureAudio();
      const rt = supabase.realtime as any;
      const wsState = rt?.conn?.readyState ?? rt?.socket?.readyState;
      if (wsState === 3 || wsState === 2) {
        try {
          rt?.connect?.();
        } catch {}
      }

      [chanRef.current, chatChanRef.current, syncChanRef.current].forEach((ch) => {
        if (ch && (ch.state === "closed" || ch.state === "errored")) {
          try {
            ch.subscribe();
          } catch {}
        }
      });

      const ch = chanRef.current;
      if (!ch) return;

      if (document.visibilityState === "visible") {
        setConnection("connected");

        // Flush any unsent chats immediately
        flushPendingChatQueue();

        // Mark incoming chats as read now that tab is active
        markChatAsRead();

        // Sync missing state & chats immediately on return
        ch.send({ type: "broadcast", event: "state_request", payload: { userId: me.current } }).catch(() => {});

        if (statusRef.current === "hosting") {
          pushPlayback();
        }
      }
    };

    document.addEventListener("visibilitychange", handleReSync);
    window.addEventListener("focus", handleReSync);
    window.addEventListener("pageshow", handleReSync);
    window.addEventListener("online", handleReSync);

    return () => {
      document.removeEventListener("visibilitychange", handleReSync);
      window.removeEventListener("focus", handleReSync);
      window.removeEventListener("pageshow", handleReSync);
      window.removeEventListener("online", handleReSync);
    };
  }, [flushPendingChatQueue, markChatAsRead, pushPlayback]);

  // Auto-transfer host on page refresh/unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (statusRef.current === "hosting") {
        const membersList = membersRef.current.filter((m) => m.id !== me.current);
        if (membersList.length > 0) {
          const coHosts = membersList.filter((m) => m.role === "host").sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
          const regular = membersList.filter((m) => m.role !== "host").sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
          const newHost = coHosts[0] || regular[0];
          const newHostNick = newHost.nickname || "Host";
          const updatedRoomName = `${newHostNick}'s Room`;
          chanRef.current?.send({
            type: "broadcast",
            event: "host_transfer",
            payload: { newHostId: newHost.id, newHostName: newHostNick, roomName: updatedRoomName },
          }).catch(() => {});
        } else {
          chanRef.current?.send({ type: "broadcast", event: "pause_all", payload: {} }).catch(() => {});
          chanRef.current?.send({ type: "broadcast", event: "room_closed", payload: {} }).catch(() => {});
        }
        announceDirectory(null);
      } else if (statusRef.current === "member") {
        const myNick = savedNickname() || nickname || "Guest";
        chanRef.current?.send({
          type: "broadcast",
          event: "member_left",
          payload: { userId: me.current, nickname: myNick },
        }).catch(() => {});
      }
      chanRef.current?.untrack().catch(() => {});
      clearRoomSession();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [announceDirectory, nickname]);

  // Initial Mount: Land on main room lobby page
  useEffect(() => {
    if (isRecoveringRef.current) return;
    isRecoveringRef.current = true;

    clearRoomSession();

    const invite = readInviteCode();
    if (invite) {
      joinRoom(invite, savedNickname() || "Guest", false);
    }
  }, [joinRoom]);

  /* ---------- derived ---------- */
  const inRoom = status === "hosting" || status === "member";
  const canDrive = useMemo(() => {
    if (!inRoom) return true;
    if (isHost) return true;
    return permissions.play_pause;
  }, [inRoom, isHost, permissions]);

  const addQueueTrack = useCallback((track: any) => {
    const ch = syncChanRef.current || chanRef.current;
    if (!ch) return;
    if (roomRef.current?.hostId === me.current || statusRef.current === "hosting") {
      const current = hRef.current.getQueue?.() || [];
      const updated = [...current, track];
      hRef.current.applyQueue?.(updated);
      ch.send({ type: "broadcast", event: "queue_update", payload: updated }).catch(() => {});
    } else {
      ch.send({ type: "broadcast", event: "queue_add", payload: { track } }).catch(() => {});
    }
  }, []);

  const broadcastQueue = useCallback((queue: any[]) => {
    const ch = syncChanRef.current || chanRef.current;
    if (!ch || (roomRef.current?.hostId !== me.current && statusRef.current !== "hosting")) return;
    ch.send({ type: "broadcast", event: "queue_update", payload: queue }).catch(() => {});
  }, []);

  return {
    me: me.current,
    status,
    room,
    isOwner,
    myRole,
    isHost,
    inRoom,
    members,
    online: members.length,
    requests,
    chat,
    typingUsers,
    permissions,
    connection,
    nickname,
    canDrive,
    publicRooms,
    voice,
    // actions
    createRoom,
    joinRoom,
    approve,
    reject,
    sendChat,
    retryChat,
    sendTyping,
    deleteChat,
    clearChat,
    setChatEnabled,
    markChatAsRead,
    updatePermissions,
    transferHost,
    promoteToHost,
    demoteHost,
    toggleVoiceEnabled,
    kick,
    closeRoom,
    leave,
    dismiss,
    updateNickname,
    pushPlayback,
    addQueueTrack,
    broadcastQueue,
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
