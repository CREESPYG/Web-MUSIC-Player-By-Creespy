import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  DIRECTORY_CHANNEL,
  HOST_ONLY_PERMS,
  SHARED_PERMS,
  genRoomCode,
  lobbyChannel,
  roomChannel,
  saveNickname,
  savedNickname,
  userId,
  type ChatMsg,
  type ConnState,
  type JoinRequest,
  type Member,
  type Permissions,
  type PlaybackState,
  type PublicControl,
  type PublicRoomEntry,
  type RoomInfo,
  type RoomStatus,
  type RoomType,
} from "../lib/room";

/** Request browser notification permission if not yet granted */
function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

/** Send a browser notification for a chat message (only when page not focused) */
function notifyChatMessage(msg: ChatMsg, roomName: string) {
  if (!("Notification" in window)) return;
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

export interface RoomHandlers {
  /** Read the current local playback so the host can broadcast it. */
  getPlayback: () => Omit<PlaybackState, "ts" | "by"> | null;
  /** Apply a remote playback state to the local player (members). */
  applyPlayback: (pb: PlaybackState) => void;
  /** Read current queue tracks for syncing to new joiners */
  getQueue?: () => any[];
  /** Apply remote queue changes */
  applyQueue?: (queue: any[]) => void;
}

interface CreateOpts {
  name: string;
  type: RoomType;
  requireApproval: boolean;
  control: PublicControl;
  chatEnabled?: boolean;
}

const HEARTBEAT_MS = 8000;

export function useRoom(handlers: RoomHandlers) {
  const me = useRef(userId());
  const hRef = useRef(handlers);
  hRef.current = handlers;

  const [status, setStatus] = useState<RoomStatus>("idle");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [permissions, setPermissions] = useState<Permissions>(HOST_ONLY_PERMS);
  const [connection, setConnection] = useState<ConnState>("offline");
  const [nickname, setNickname] = useState(savedNickname());
  const [banned] = useState<Set<string>>(() => new Set());
  const [publicRooms, setPublicRooms] = useState<PublicRoomEntry[]>([]);

  const roomRef = useRef<RoomInfo | null>(null);
  roomRef.current = room;
  const permRef = useRef<Permissions>(permissions);
  permRef.current = permissions;
  const statusRef = useRef<RoomStatus>(status);
  statusRef.current = status;

  const lobbyRef = useRef<RealtimeChannel | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const dirRef = useRef<RealtimeChannel | null>(null);
  const beatRef = useRef<number>(0);
  const banRef = useRef(banned);

  const isHost = room?.hostId === me.current;

  /* ---------- public rooms directory (always-on, read for everyone) ---------- */
  const syncDirectory = useCallback((ch: RealtimeChannel) => {
    const state = ch.presenceState() as Record<string, any[]>;
    const list: PublicRoomEntry[] = [];
    Object.values(state).forEach((metas) => {
      const m = (metas?.[0] ?? {}) as any;
      if (m?.code) {
        list.push({
          code: m.code,
          name: m.name || "Music room",
          hostName: m.hostName || "Host",
          count: m.count ?? 1,
          requireApproval: !!m.requireApproval,
          at: m.at || Date.now(),
        });
      }
    });
    list.sort((a, b) => b.count - a.count || a.at - b.at);
    setPublicRooms(list);
  }, []);

  useEffect(() => {
    const dir = supabase.channel(DIRECTORY_CHANNEL, { config: { presence: { key: me.current } } });
    dirRef.current = dir;
    dir.on("presence", { event: "sync" }, () => syncDirectory(dir));
    dir.on("presence", { event: "join" }, () => syncDirectory(dir));
    dir.on("presence", { event: "leave" }, () => syncDirectory(dir));
    dir.subscribe((s) => {
      if (s === "SUBSCRIBED") syncDirectory(dir);
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
    if (entry) dir.track(entry).catch(() => {});
    else dir.untrack().catch(() => {});
  }, []);

  /* ---------- cleanup ---------- */
  const teardown = useCallback(() => {
    window.clearInterval(beatRef.current);
    if (lobbyRef.current) supabase.removeChannel(lobbyRef.current);
    if (chanRef.current) supabase.removeChannel(chanRef.current);
    lobbyRef.current = null;
    chanRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  /* ---------- presence → members ---------- */
  const syncMembers = useCallback((ch: RealtimeChannel) => {
    const state = ch.presenceState() as Record<string, any[]>;
    const list: Member[] = [];
    Object.entries(state).forEach(([id, metas]) => {
      const m = (metas?.[0] ?? {}) as any;
      list.push({ id, nickname: m.nickname || "Guest", role: m.role || "member", at: m.at || Date.now() });
    });
    list.sort((a, b) => (a.role === "host" ? -1 : b.role === "host" ? 1 : a.at - b.at));
    setMembers(list);
  }, []);

  /* ---------- host broadcast of playback ---------- */
  const pushPlayback = useCallback(() => {
    const ch = chanRef.current;
    if (!ch) return;
    const canDrive = roomRef.current?.hostId === me.current || permRef.current.play_pause;
    if (!canDrive) return;
    const pb = hRef.current.getPlayback();
    if (!pb) return;
    ch.send({
      type: "broadcast",
      event: "playback",
      payload: { ...pb, ts: Date.now(), by: me.current } as PlaybackState,
    });
  }, []);

  /* ---------- wire the members channel ---------- */
  const bindRoomChannel = useCallback(
    (code: string, role: "host" | "member", info: RoomInfo) => {
      const ch = supabase.channel(roomChannel(code), {
        config: { presence: { key: me.current }, broadcast: { self: false } },
      });
      chanRef.current = ch;

      ch.on("presence", { event: "sync" }, () => syncMembers(ch));
      ch.on("presence", { event: "join" }, () => syncMembers(ch));
      ch.on("presence", { event: "leave" }, () => syncMembers(ch));

      // Everyone receives playback from whoever currently has control (host or permitted member)
      ch.on("broadcast", { event: "playback" }, ({ payload }) => {
        const pb = payload as PlaybackState;
        // Don't echo back if we were the one who dispatched it
        if (pb.by === me.current) return;
        hRef.current.applyPlayback(pb);
      });

      // a fresh member asks the host for current state
      ch.on("broadcast", { event: "state_request" }, ({ payload }) => {
        if (roomRef.current?.hostId !== me.current) return;
        const pb = hRef.current.getPlayback();
        const q = hRef.current.getQueue?.() || [];
        ch.send({
          type: "broadcast",
          event: "sync_state",
          payload: {
            to: payload.userId,
            playback: pb ? { ...pb, ts: Date.now(), by: me.current } : null,
            permissions: permRef.current,
            room: roomRef.current,
            queue: q,
            chat: [] as ChatMsg[],
          },
        });
      });

      ch.on("broadcast", { event: "sync_state" }, ({ payload }) => {
        if (payload.to !== me.current) return;
        if (payload.room) {
          setRoom(payload.room);
          roomRef.current = payload.room;
        }
        if (payload.permissions) setPermissions(payload.permissions);
        if (Array.isArray(payload.queue) && payload.queue.length > 0) {
          hRef.current.applyQueue?.(payload.queue);
        }
        if (payload.playback) hRef.current.applyPlayback(payload.playback as PlaybackState);
      });

      // Member requests to add a song to the shared queue
      ch.on("broadcast", { event: "queue_add" }, ({ payload }) => {
        if (roomRef.current?.hostId !== me.current) return;
        const currentQueue = hRef.current.getQueue?.() || [];
        const incomingTrack = payload.track;
        if (!incomingTrack) return;
        // Avoid duplicate ID in queue
        const exists = currentQueue.some((t: any) => t.id === incomingTrack.id || t.videoId === incomingTrack.videoId);
        if (!exists) {
          const newQueue = [...currentQueue, incomingTrack];
          hRef.current.applyQueue?.(newQueue);
          // Broadcast updated queue to all room members
          ch.send({
            type: "broadcast",
            event: "queue_update",
            payload: newQueue,
          });
        }
      });

      // All members receive authoritative queue updates from host
      ch.on("broadcast", { event: "queue_update" }, ({ payload }) => {
        if (roomRef.current?.hostId === me.current) return;
        if (Array.isArray(payload)) {
          hRef.current.applyQueue?.(payload);
        }
      });

      ch.on("broadcast", { event: "permissions" }, ({ payload }) => {
        setPermissions(payload as Permissions);
      });

      ch.on("broadcast", { event: "chat" }, ({ payload }) => {
        const m = payload as ChatMsg;
        setChat((prev) => (prev.some((c) => c.id === m.id) ? prev : [...prev, { ...m, mine: m.userId === me.current }].slice(-120)));
        // Send browser notification if message is from someone else and page not focused
        if (m.userId !== me.current && roomRef.current) {
          notifyChatMessage(m, roomRef.current.name);
        }
      });
      ch.on("broadcast", { event: "chat_delete" }, ({ payload }) => {
        setChat((prev) => prev.filter((c) => c.id !== payload.id));
      });
      ch.on("broadcast", { event: "chat_clear" }, () => setChat([]));
      ch.on("broadcast", { event: "chat_toggle" }, ({ payload }) => {
        setRoom((r) => (r ? { ...r, chatEnabled: payload.enabled } : r));
        if (roomRef.current) roomRef.current.chatEnabled = payload.enabled;
      });

      ch.on("broadcast", { event: "host_transfer" }, ({ payload }) => {
        setRoom((r) => (r ? { ...r, hostId: payload.newHostId, hostName: payload.newHostName } : r));
        roomRef.current = roomRef.current ? { ...roomRef.current, hostId: payload.newHostId, hostName: payload.newHostName } : roomRef.current;
        setStatus(payload.newHostId === me.current ? "hosting" : "member");
      });

      ch.on("broadcast", { event: "kick" }, ({ payload }) => {
        if (payload.userId === me.current) {
          teardown();
          setStatus("denied");
          setRoom(null);
          setMembers([]);
          setChat([]);
        }
      });

      ch.on("broadcast", { event: "room_closed" }, () => {
        if (roomRef.current?.hostId === me.current) return;
        teardown();
        setStatus("closed");
        setMembers([]);
      });

      ch.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setConnection("connected");
          ch.track({ nickname: savedNickname() || "Guest", role, at: Date.now() });
          syncMembers(ch);
          requestNotificationPermission();
          if (role === "member") {
            // ask host for the current state after a tick
            window.setTimeout(() => {
              ch.send({ type: "broadcast", event: "state_request", payload: { userId: me.current } });
            }, 400);
          } else {
            // host heartbeat keeps late-joiners aligned (timestamp based, low freq)
            window.clearInterval(beatRef.current);
            beatRef.current = window.setInterval(pushPlayback, HEARTBEAT_MS);
          }
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setConnection("reconnecting");
        } else if (s === "CLOSED") {
          setConnection((c) => (statusRef.current === "idle" ? "offline" : c));
        }
      });

      void info;
      return ch;
    },
    [pushPlayback, syncMembers, teardown]
  );

  /* ---------- create ---------- */
  const createRoom = useCallback(
    (opts: CreateOpts) => {
      teardown();
      const code = genRoomCode();
      const nick = savedNickname() || "Host";
      const info: RoomInfo = {
        code,
        name: opts.name.trim() || `${nick}'s Room`,
        type: opts.type,
        requireApproval: opts.type === "private" ? true : opts.requireApproval,
        hostId: me.current,
        hostName: nick,
        chatEnabled: opts.chatEnabled ?? true,
      };
      setRoom(info);
      roomRef.current = info;
      const perms = opts.type === "public" && opts.control === "shared" ? SHARED_PERMS : HOST_ONLY_PERMS;
      setPermissions(perms);
      permRef.current = perms;
      setChat([]);
      setRequests([]);
      setStatus("hosting");

      // lobby: host presence advertises the room config so joiners can self-admit
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
        const cur = roomRef.current!;
        if (cur.type === "public" && !cur.requireApproval) {
          // open join → auto approve
          lob.send({
            type: "broadcast",
            event: "join_response",
            payload: { userId: req.userId, approved: true, room: cur, permissions: permRef.current },
          });
          return;
        }
        // let the requester know a host is here (so it keeps waiting for approval)
        lob.send({ type: "broadcast", event: "join_ack", payload: { userId: req.userId } });
        setRequests((prev) => (prev.some((r) => r.userId === req.userId) ? prev : [...prev, req]));
      });
      lob.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setConnection("connected");
          // advertise the room in lobby presence → joiners can self-admit (open join)
          lob.track({ role: "host", room: info, permissions: permRef.current, at: Date.now() }).catch(() => {});
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setConnection("reconnecting");
        }
      });

      bindRoomChannel(code, "host", info);

      // list public rooms in the global directory
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
    [announceDirectory, bindRoomChannel, teardown]
  );

  /* ---------- join ---------- */
  const joinRoom = useCallback(
    (code: string, nick: string) => {
      teardown();
      const clean = code.trim().toUpperCase();
      saveNickname(nick.trim() || "Guest");
      setNickname(nick.trim() || "Guest");
      setStatus("requesting");
      setChat([]);

      const lob = supabase.channel(lobbyChannel(clean), {
        config: { broadcast: { self: false }, presence: { key: me.current } },
      });
      lobbyRef.current = lob;

      let resolved = false;
      let ackd = false;

      // Find the host advertised in lobby presence and act on the room config.
      const tryHostPresence = (): boolean => {
        const state = lob.presenceState() as Record<string, any[]>;
        for (const metas of Object.values(state)) {
          const m = (metas?.[0] ?? {}) as any;
          if (m?.role === "host" && m?.room) {
            ackd = true; // a host exists
            const info: RoomInfo = m.room;
            if (info.type === "public" && !info.requireApproval) {
              // Option A — anyone can join → self-admit immediately
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
          setStatus("denied");
          teardown();
        }
      });

      const sendReq = () =>
        lob.send({
          type: "broadcast",
          event: "join_request",
          payload: { userId: me.current, nickname: nick.trim() || "Guest", at: Date.now() } as JoinRequest,
        });

      lob.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setConnection("connected");
          setStatus("waiting");
          // announce ourselves so the host presence-list can see us, then read host config
          lob.track({ role: "member", nickname: nick.trim() || "Guest", at: Date.now() }).catch(() => {});
          const admitted = tryHostPresence();
          if (!admitted) {
            sendReq();
            window.setTimeout(() => !resolved && (tryHostPresence() || sendReq()), 900);
            window.setTimeout(() => !resolved && (tryHostPresence() || sendReq()), 2400);
          }
          // no host presence and no answer → room not found / host offline
          window.setTimeout(() => {
            if (!resolved && !ackd && (statusRef.current === "waiting" || statusRef.current === "requesting")) {
              setStatus("error");
              teardown();
            }
          }, 14000);
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setConnection("reconnecting");
        }
      });
    },
    [bindRoomChannel, teardown]
  );

  /* ---------- host: approve / reject ---------- */
  const approve = useCallback((uid: string) => {
    const lob = lobbyRef.current;
    if (!lob || !roomRef.current) return;
    lob.send({
      type: "broadcast",
      event: "join_response",
      payload: { userId: uid, approved: true, room: roomRef.current, permissions: permRef.current },
    });
    setRequests((prev) => prev.filter((r) => r.userId !== uid));
  }, []);

  const reject = useCallback((uid: string) => {
    const lob = lobbyRef.current;
    lob?.send({ type: "broadcast", event: "join_response", payload: { userId: uid, approved: false } });
    setRequests((prev) => prev.filter((r) => r.userId !== uid));
  }, []);

  /* ---------- chat ---------- */
  const sendChat = useCallback((text: string) => {
    const ch = chanRef.current;
    const t = text.trim();
    if (!ch || !t) return;
    const msg: ChatMsg = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      userId: me.current,
      nickname: savedNickname() || "Guest",
      message: t.slice(0, 400),
      ts: Date.now(),
    };
    setChat((prev) => [...prev, { ...msg, mine: true }].slice(-120));
    ch.send({ type: "broadcast", event: "chat", payload: msg });
  }, []);

  const deleteChat = useCallback((id: string) => {
    chanRef.current?.send({ type: "broadcast", event: "chat_delete", payload: { id } });
    setChat((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearChat = useCallback(() => {
    chanRef.current?.send({ type: "broadcast", event: "chat_clear", payload: {} });
    setChat([]);
  }, []);

  const setChatEnabled = useCallback((on: boolean) => {
    setRoom((r) => (r ? { ...r, chatEnabled: on } : r));
    roomRef.current = roomRef.current ? { ...roomRef.current, chatEnabled: on } : roomRef.current;
    chanRef.current?.send({ type: "broadcast", event: "chat_toggle", payload: { enabled: on } });
  }, []);

  /* ---------- host controls ---------- */
  const updatePermissions = useCallback((next: Permissions) => {
    setPermissions(next);
    permRef.current = next;
    chanRef.current?.send({ type: "broadcast", event: "permissions", payload: next });
  }, []);

  const transferHost = useCallback((uid: string) => {
    const target = members.find((m) => m.id === uid);
    if (!target || !roomRef.current) return;
    chanRef.current?.send({
      type: "broadcast",
      event: "host_transfer",
      payload: { newHostId: uid, newHostName: target.nickname },
    });
    setRoom((r) => (r ? { ...r, hostId: uid, hostName: target.nickname } : r));
    roomRef.current = roomRef.current ? { ...roomRef.current, hostId: uid, hostName: target.nickname } : roomRef.current;
    setStatus("member");
    window.clearInterval(beatRef.current);
  }, [members]);

  const kick = useCallback((uid: string, ban = false) => {
    if (ban) banRef.current.add(uid);
    chanRef.current?.send({ type: "broadcast", event: "kick", payload: { userId: uid } });
    setMembers((prev) => prev.filter((m) => m.id !== uid));
  }, []);

  const closeRoom = useCallback(() => {
    chanRef.current?.send({ type: "broadcast", event: "room_closed", payload: {} });
    announceDirectory(null);
    teardown();
    setStatus("idle");
    setRoom(null);
    setMembers([]);
    setChat([]);
    setRequests([]);
  }, [announceDirectory, teardown]);

  const leave = useCallback(() => {
    announceDirectory(null);
    teardown();
    setStatus("idle");
    setRoom(null);
    setMembers([]);
    setChat([]);
    setRequests([]);
    setConnection("offline");
  }, [announceDirectory, teardown]);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setRoom(null);
  }, []);

  const updateNickname = useCallback((n: string) => {
    saveNickname(n);
    setNickname(n);
  }, []);

  // host keeps the directory count in sync with real presence
  useEffect(() => {
    const r = roomRef.current;
    if (r && r.type === "public" && r.hostId === me.current) {
      announceDirectory({
        code: r.code,
        name: r.name,
        hostName: r.hostName,
        count: Math.max(1, members.length),
        requireApproval: r.requireApproval,
        at: Date.now(),
      });
    }
  }, [members.length, announceDirectory]);

  /* ---------- derived ---------- */
  const inRoom = status === "hosting" || status === "member";
  const canDrive = useMemo(() => {
    if (!inRoom) return true; // solo: full control
    if (isHost) return true; // host always has control regardless of permissions
    // Members can drive if they have play_pause permission
    return permissions.play_pause;
  }, [inRoom, isHost, permissions]);

  const addQueueTrack = useCallback((track: any) => {
    const ch = chanRef.current;
    if (!ch) return;
    if (roomRef.current?.hostId === me.current) {
      const current = hRef.current.getQueue?.() || [];
      const updated = [...current, track];
      hRef.current.applyQueue?.(updated);
      ch.send({ type: "broadcast", event: "queue_update", payload: updated });
    } else {
      ch.send({ type: "broadcast", event: "queue_add", payload: { track } });
    }
  }, []);

  const broadcastQueue = useCallback((queue: any[]) => {
    const ch = chanRef.current;
    if (!ch || roomRef.current?.hostId !== me.current) return;
    ch.send({ type: "broadcast", event: "queue_update", payload: queue });
  }, []);

  return {
    me: me.current,
    status,
    room,
    isHost,
    inRoom,
    members,
    online: members.length,
    requests,
    chat,
    permissions,
    connection,
    nickname,
    canDrive,
    publicRooms,
    // actions
    createRoom,
    joinRoom,
    approve,
    reject,
    sendChat,
    deleteChat,
    clearChat,
    setChatEnabled,
    updatePermissions,
    transferHost,
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
