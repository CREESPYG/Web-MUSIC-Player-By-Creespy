import React, { useState } from "react";
import type { RoomApi } from "../hooks/useRoom";
import { persistence, type RoomHistoryItem } from "../lib/persistence";
import {
  RadioTowerIcon,
  PlusIcon,
  ShareIcon,
  CheckIcon,
  HeadphonesIcon,
  GlobeIcon,
  LockIcon,
  SendIcon,
} from "./UiIcons";

interface RoomsViewProps {
  room: RoomApi;
  onToast: (msg: string) => void;
}

export const RoomsView: React.FC<RoomsViewProps> = ({
  room,
  onToast,
}) => {
  const [tab, setTab] = useState<"public" | "join" | "create" | "history">("public");
  const [joinCode, setJoinCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState<"public" | "private">("public");
  const [chatInput, setChatInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [history] = useState<RoomHistoryItem[]>(() => persistence.getRoomHistory());

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const name = roomName.trim() || `${room.nickname}'s Room`;
    room.createRoom({
      name,
      type: roomType,
      requireApproval: false,
      control: "shared",
    });
    onToast(`Creating ${roomType} room: "${name}"`);
  };

  const handleJoinCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCode.trim().toUpperCase();
    if (!clean) return;
    room.joinRoom(clean, room.nickname);
    onToast(`Joining room #${clean}...`);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    room.sendChat(chatInput.trim());
    setChatInput("");
  };

  const copyInvite = () => {
    if (!room.room?.code) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.room.code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(true);
      onToast(`Invite link copied for #${room.room?.code}`);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  // If currently in a room:
  if (room.inRoom && room.room) {
    return (
      <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-6">
        {/* Active Room Top Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 backdrop-blur-md">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-lg font-bold text-white truncate">{room.room.name}</h2>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                #{room.room.code}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-[var(--dim)]">
              <span>Host: <strong className="text-white">{room.room.hostName || "Host"}</strong></span>
              <span>•</span>
              <span>{room.members.length} {room.members.length === 1 ? "listener" : "listeners"}</span>
              <span>•</span>
              <span className="capitalize">{room.room.type} room</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyInvite}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors"
            >
              {copiedCode ? <CheckIcon size={14} className="text-emerald-400" /> : <ShareIcon size={14} />}
              <span>{copiedCode ? "Copied!" : "Invite Link"}</span>
            </button>

            {room.isHost ? (
              <button
                onClick={() => {
                  room.closeRoom();
                  onToast("Room closed");
                }}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                Close Room
              </button>
            ) : (
              <button
                onClick={() => {
                  room.leave();
                  onToast("Left room");
                }}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-[var(--dim)] hover:text-white transition-colors"
              >
                Leave
              </button>
            )}
          </div>
        </div>

        {/* Room Grid: Live Chat & Participants */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Chat (2 cols) */}
          <div className="lg:col-span-2 flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 h-[440px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
              <span className="text-xs font-semibold text-white">Live Room Chat</span>
              <span className="text-[10px] text-[var(--dim)]">{room.chat.length} messages</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
              {room.chat.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-[var(--dim)]">
                  No messages yet. Send a message to the room!
                </div>
              ) : (
                room.chat.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-2.5 max-w-[85%] ${
                      msg.userId === room.me
                        ? "ml-auto bg-[var(--acc0)]/20 border border-[var(--acc0)]/30 text-white"
                        : "bg-white/5 border border-white/5 text-white/90"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--dim)] mb-0.5">
                      <span className="font-semibold text-[var(--acc0)]">{msg.nickname}</span>
                      <span>{new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="break-words leading-relaxed">{msg.message}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChat} className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message listening room..."
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-xs text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--acc0)] text-black disabled:opacity-40"
              >
                <SendIcon size={14} />
              </button>
            </form>
          </div>

          {/* Participants List (1 col) */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 h-[440px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
              <span className="text-xs font-semibold text-white">Participants ({room.members.length})</span>
              <HeadphonesIcon size={14} className="text-[var(--acc0)]" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {room.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-xl bg-white/5 p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="truncate font-medium text-white">{m.nickname}</span>
                  </div>
                  {m.role === "host" && (
                    <span className="rounded bg-[var(--acc0)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--acc0)]">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Lobby / Directory View
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--acc0)]/20 text-[var(--acc0)]">
              <RadioTowerIcon size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Listening Rooms</h1>
          </div>
          <p className="mt-1 text-xs text-[var(--dim)]">
            Listen in sync with friends across the world with Supabase Realtime
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg bg-black/40 p-1 border border-white/10">
          {(["public", "join", "create", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                tab === t
                  ? "bg-[var(--acc0)] text-black font-semibold shadow-sm"
                  : "text-[var(--dim)] hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Public Rooms */}
      {tab === "public" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
              Active Public Rooms ({room.publicRooms.length})
            </h3>
            <button
              onClick={() => setTab("create")}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--acc0)] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110"
            >
              <PlusIcon size={13} />
              Host New Room
            </button>
          </div>

          {room.publicRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-12 text-center">
              <RadioTowerIcon size={40} className="text-[var(--dim)]/40 mb-3" />
              <h4 className="text-sm font-medium text-white">No active public rooms right now</h4>
              <p className="mt-1 text-xs text-[var(--dim)] max-w-sm">
                Be the first to host a synchronized room and invite listeners!
              </p>
              <button
                onClick={() => setTab("create")}
                className="mt-4 rounded-xl bg-[var(--acc0)] px-4 py-2 text-xs font-bold text-black"
              >
                Create Room
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {room.publicRooms.map((pr) => (
                <div
                  key={pr.code}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-white/20 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <h4 className="truncate text-sm font-semibold text-white">{pr.name}</h4>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--dim)]">
                      <span>Host: {pr.hostName}</span>
                      <span>•</span>
                      <span>{pr.count} {pr.count === 1 ? "listener" : "listeners"}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      room.joinRoom(pr.code, room.nickname);
                      onToast(`Connecting to room #${pr.code}`);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--acc0)] px-3.5 py-1.5 text-xs font-semibold text-black hover:brightness-110 shrink-0 ml-3"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Join by Code */}
      {tab === "join" && (
        <div className="max-w-md mx-auto rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center space-y-4">
          <RadioTowerIcon size={32} className="text-[var(--acc0)] mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-white">Join with Room Code</h3>
            <p className="mt-1 text-xs text-[var(--dim)]">
              Enter the 6-character room code shared by your friend
            </p>
          </div>

          <form onSubmit={handleJoinCode} className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="e.g. A9B2X1"
              className="w-full text-center rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-lg font-bold tracking-widest text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
            />
            <button
              type="submit"
              disabled={joinCode.trim().length < 3 || room.status === "requesting"}
              className="w-full rounded-xl bg-[var(--acc0)] py-2.5 text-xs font-bold text-black disabled:opacity-40 hover:brightness-110"
            >
              {room.status === "requesting" ? "Connecting..." : "Join Room"}
            </button>
          </form>
        </div>
      )}

      {/* Tab: Create Room */}
      {tab === "create" && (
        <form onSubmit={handleCreateRoom} className="max-w-lg mx-auto rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
          <h3 className="text-base font-semibold text-white">Host a New Room</h3>

          <div>
            <label className="text-xs font-medium text-white block mb-1.5">Room Name</label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g. Midnight Chill & Lofi"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3.5 py-2 text-xs text-white placeholder-[var(--dim)] outline-none focus:border-[var(--acc0)]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-white block mb-1.5">Room Visibility</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRoomType("public")}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                  roomType === "public"
                    ? "border-[var(--acc0)] bg-[var(--acc0)]/15"
                    : "border-white/10 bg-black/20 text-[var(--dim)]"
                }`}
              >
                <span className="text-xs font-bold text-white"><GlobeIcon size={14} className="inline" /> Public</span>
                <span className="text-[10px] text-[var(--dim)] mt-0.5">Discoverable in active room directory</span>
              </button>

              <button
                type="button"
                onClick={() => setRoomType("private")}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                  roomType === "private"
                    ? "border-[var(--acc0)] bg-[var(--acc0)]/15"
                    : "border-white/10 bg-black/20 text-[var(--dim)]"
                }`}
              >
                <span className="text-xs font-bold text-white"><LockIcon size={14} className="inline" /> Private</span>
                <span className="text-[10px] text-[var(--dim)] mt-0.5">Direct invite link or code only</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--acc0)] py-3 text-xs font-bold text-black hover:brightness-110 transition-all shadow-md"
          >
            Launch Room
          </button>
        </form>
      )}

      {/* Tab: Room History */}
      {tab === "history" && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
            Recently Visited Rooms ({history.length})
          </h3>

          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-[var(--dim)]">
              No rooms in history yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {history.map((h) => (
                <div
                  key={`${h.roomCode}-${h.lastJoined}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3.5"
                >
                  <div className="min-w-0">
                    <h4 className="truncate text-xs font-semibold text-white">{h.name}</h4>
                    <p className="font-mono text-[11px] text-[var(--acc0)]">#{h.roomCode}</p>
                  </div>
                  <button
                    onClick={() => {
                      room.joinRoom(h.roomCode, room.nickname);
                      onToast(`Reconnecting to room #${h.roomCode}`);
                    }}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                  >
                    Rejoin
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
