import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { RoomApi } from "../hooks/useRoom";
import type { Permissions, PublicControl, RoomType } from "../lib/room";
import { HOST_ONLY_PERMS, SHARED_PERMS, inviteLink } from "../lib/room";
import { cn } from "../utils/cn";
import {
  ChatIcon,
  CloseIcon,
  CopyIcon,
  CrownIcon,
  GlobeIcon,
  HeadphonesIcon,
  GroupIcon,
  LockIcon,
  NotificationsIcon,
  SendIcon,
  Switch,
} from "./UiIcons";

const PERM_LABELS: [keyof Permissions, string][] = [
  ["play_pause", "Play / Pause"],
  ["next", "Next"],
  ["previous", "Previous"],
  ["seek", "Seek"],
  ["add_song", "Add songs"],
  ["shuffle", "Shuffle"],
];

export function RoomPanel({ open, onClose, room, onToast }: { open: boolean; onClose: () => void; room: RoomApi; onToast: (m: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<RoomType>("public");
  const [approval, setApproval] = useState(false);
  const [control, setControl] = useState<PublicControl>("host");
  const [allowChat, setAllowChat] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [nick, setNick] = useState(room.nickname);
  const [chatDraft, setChatDraft] = useState("");
  const [inRoomTab, setInRoomTab] = useState<"chat" | "settings" | "people">("chat");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.chat.length]);

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => onToast(`${label} copied`)).catch(() => onToast("Copy failed"));
  };

  const controls = room.canDrive; // whether this client may drive shared playback
  const inRoom = room.inRoom;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[65] bg-black/45 backdrop-blur-[2px]" />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-[66] flex h-[100dvh] w-full max-w-[min(400px,100vw)] flex-col border-l border-white/10"
            style={{ background: "linear-gradient(180deg, rgba(9,14,22,0.97), rgba(6,10,17,0.99))", backdropFilter: "blur(26px)", paddingBottom: "env(safe-area-inset-bottom)" }}
            aria-label="Room panel"
          >
            {/* header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-3.5">
              <h3 className="flex items-center gap-2 font-display text-[15px] font-bold tracking-[0.05em] text-[var(--ink)]">
                <HeadphonesIcon size={16} className="text-[var(--acc0)]" /> Listen Together
                {inRoom && (
                  <span
                    className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 font-tmono text-[8px] uppercase tracking-[0.12em]"
                    style={{ color: room.connection === "connected" ? "var(--acc2)" : "var(--dim)" }}
                  >
                    <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: room.connection === "connected" ? "var(--acc2)" : "#f5a97f" }} />
                    {room.connection === "connected" ? "live" : "reconnecting"}
                  </span>
                )}
              </h3>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--dim)] transition-colors hover:bg-white/8 hover:text-white" aria-label="Close">
                <CloseIcon size={17} />
              </button>
            </div>

            <div className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
              {/* ---------------- LOBBY (idle / create + join) ---------------- */}
              {!inRoom && room.status !== "waiting" && room.status !== "requesting" && (
                <div className="flex flex-col gap-5">
                  {(room.status === "denied" || room.status === "closed" || room.status === "error") && (
                    <div className="rounded-[var(--radius-s)] border border-[#ff6b7a]/30 bg-[#ff6b7a]/10 px-3 py-2.5 text-[12px] text-[#ffb3ba]">
                      {room.status === "denied"
                        ? "Your request was declined or you were removed."
                        : room.status === "closed"
                          ? "The room was closed by the host."
                          : "Room not found or the host is offline. Check the code and try again."}
                    </div>
                  )}

                  {/* nickname */}
                  <div>
                    <p className="mb-2 font-tmono text-[9px] uppercase tracking-[0.24em] text-[var(--dim)]">Your name</p>
                    <input
                      value={nick}
                      onChange={(e) => {
                        setNick(e.target.value);
                        room.updateNickname(e.target.value);
                      }}
                      placeholder="Nickname"
                      className="w-full rounded-[var(--radius-s)] border border-white/12 bg-white/6 px-3 py-2.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
                    />
                  </div>

                  {/* create */}
                  <div className="rounded-[var(--radius)] border border-white/8 bg-white/[0.03] p-4">
                    <p className="mb-3 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">Create a room</p>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Room name"
                      className="mb-3 w-full rounded-[var(--radius-s)] border border-white/12 bg-white/6 px-3 py-2.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
                    />
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {(["public", "private"] as RoomType[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setType(t)}
                          className="flex items-center justify-center gap-1.5 rounded-[var(--radius-s)] border py-2.5 font-tmono text-[10px] uppercase tracking-[0.12em] transition-colors"
                          style={{
                            borderColor: type === t ? "var(--acc0)" : "rgba(255,255,255,0.12)",
                            background: type === t ? "color-mix(in srgb, var(--acc0) 14%, transparent)" : "transparent",
                            color: type === t ? "var(--acc0)" : "var(--dim)",
                          }}
                        >
                          {t === "public" ? <GlobeIcon size={13} /> : <LockIcon size={13} />} {t}
                        </button>
                      ))}
                    </div>

                    {type === "public" ? (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)]">Access policy</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setApproval(false)}
                              className="glass-hover flex flex-col rounded-[var(--radius-s)] border p-3 text-left transition-all"
                              style={{
                                borderColor: !approval ? "var(--acc0)" : "rgba(255,255,255,0.1)",
                                background: !approval ? "color-mix(in srgb, var(--acc0) 14%, transparent)" : "rgba(255,255,255,0.02)",
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-display text-[11px] font-bold tracking-[0.08em]" style={{ color: !approval ? "var(--acc0)" : "var(--ink)" }}>
                                  OPTION A
                                </span>
                                {!approval && <span className="h-2 w-2 rounded-full bg-[var(--acc0)] shadow-[0_0_8px_var(--acc0)]" />}
                              </div>
                              <span className="mt-1 text-[11px] font-medium text-[var(--ink)]">Open Access</span>
                              <span className="text-[9.5px] text-[var(--dim)]">Instant join, no waiting</span>
                            </button>
                            <button
                              onClick={() => setApproval(true)}
                              className="glass-hover flex flex-col rounded-[var(--radius-s)] border p-3 text-left transition-all"
                              style={{
                                borderColor: approval ? "var(--acc0)" : "rgba(255,255,255,0.1)",
                                background: approval ? "color-mix(in srgb, var(--acc0) 14%, transparent)" : "rgba(255,255,255,0.02)",
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-display text-[11px] font-bold tracking-[0.08em]" style={{ color: approval ? "var(--acc0)" : "var(--ink)" }}>
                                  OPTION B
                                </span>
                                {approval && <span className="h-2 w-2 rounded-full bg-[var(--acc0)] shadow-[0_0_8px_var(--acc0)]" />}
                              </div>
                              <span className="mt-1 text-[11px] font-medium text-[var(--ink)]">Host Approval</span>
                              <span className="text-[9.5px] text-[var(--dim)]">Vetted joins only</span>
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)]">Music control</p>
                          <div className="grid grid-cols-2 gap-2">
                            {(["host", "shared"] as PublicControl[]).map((c) => {
                              const active = control === c;
                              return (
                                <button
                                  key={c}
                                  onClick={() => setControl(c)}
                                  className="glass-hover rounded-[var(--radius-s)] border py-2.5 px-3 text-left transition-all"
                                  style={{
                                    borderColor: active ? "var(--acc0)" : "rgba(255,255,255,0.1)",
                                    background: active ? "color-mix(in srgb, var(--acc0) 14%, transparent)" : "rgba(255,255,255,0.02)",
                                  }}
                                >
                                  <span className="block font-display text-[11px] font-bold tracking-tight" style={{ color: active ? "var(--acc0)" : "var(--ink)" }}>
                                    {c === "host" ? "Host Only" : "Shared Sync"}
                                  </span>
                                  <span className="mt-0.5 block text-[9.5px] text-[var(--dim)]">
                                    {c === "host" ? "Only host alters music" : "Members can play/seek"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[var(--radius-s)] border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center gap-2">
                          <LockIcon size={14} className="text-[var(--acc0)]" />
                          <span className="font-display text-[12px] font-bold text-[var(--ink)]">Private Room Safeguard</span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--dim)]">
                          Host approval is strictly enforced for every joiner. Playback and live chat are exclusive to approved guests.
                        </p>
                      </div>
                    )}

                    {/* Live Chat toggle during creation */}
                    <div className="my-3 flex items-center justify-between rounded-[var(--radius-s)] border border-white/8 bg-white/[0.02] p-2.5">
                      <div>
                        <p className="text-[11.5px] font-medium text-[var(--ink)]">Enable Live Chat</p>
                        <p className="text-[9px] text-[var(--dim)]">Let participants message in this room</p>
                      </div>
                      <Switch on={allowChat} onChange={setAllowChat} label="Enable Live Chat" />
                    </div>

                    <button
                      onClick={() => {
                        const info = room.createRoom({ name, type, requireApproval: approval, control, chatEnabled: allowChat });
                        onToast(`Room ${info.code} created`);
                      }}
                      className="mt-2 w-full rounded-[var(--radius-s)] py-2.5 font-tmono text-[10px] uppercase tracking-[0.14em] text-black"
                      style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                    >
                      Create room
                    </button>
                  </div>

                  {/* join */}
                  <div className="rounded-[var(--radius)] border border-white/8 bg-white/[0.03] p-4">
                    <p className="mb-2 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">Join with invite code</p>
                    <div className="flex gap-2">
                      <input
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="e.g. 7X42K"
                        maxLength={8}
                        className="min-w-0 flex-1 rounded-[var(--radius-s)] border border-white/12 bg-white/6 px-3.5 py-2.5 font-tmono text-[14px] uppercase tracking-[0.25em] text-[var(--ink)] outline-none placeholder:tracking-normal placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
                      />
                      <button
                        onClick={() => {
                          if (!joinCode.trim()) return onToast("Enter a room code");
                          room.joinRoom(joinCode, nick);
                        }}
                        className="shrink-0 rounded-[var(--radius-s)] px-5 font-tmono text-[10.5px] uppercase tracking-[0.14em] text-black font-semibold"
                        style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                      >
                        Enter
                      </button>
                    </div>
                  </div>

                  {/* public rooms directory */}
                  <div className="rounded-[var(--radius)] border border-white/8 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
                        <GlobeIcon size={13} className="text-[var(--acc0)]" /> Public rooms
                      </p>
                      <span className="font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]">
                        {room.publicRooms.length} live
                      </span>
                    </div>
                    {room.publicRooms.length === 0 ? (
                      <p className="rounded-[var(--radius-s)] border border-white/8 bg-white/[0.02] px-3 py-4 text-center font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]/60">
                        no public rooms right now — create one!
                      </p>
                    ) : (
                      <div className="scroll-slim flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-0.5">
                        {room.publicRooms.map((r) => (
                          <div key={r.code} className="flex items-center gap-3 rounded-[var(--radius-s)] border border-white/8 bg-white/[0.03] p-2.5">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--acc0)]" style={{ background: "color-mix(in srgb, var(--acc0) 14%, transparent)" }}>
                              <HeadphonesIcon size={18} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-bold text-[var(--ink)]">{r.name}</p>
                              <p className="flex items-center gap-2 font-tmono text-[8.5px] uppercase tracking-[0.12em] text-[var(--dim)]">
                                <span>{r.hostName}</span>
                                <span className="flex items-center gap-1">
                                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--acc2)]" />
                                  {r.count}
                                </span>
                                {r.requireApproval && <span className="text-[var(--acc1)]">approval</span>}
                              </p>
                            </div>
                            <button
                              onClick={() => room.joinRoom(r.code, nick)}
                              className="shrink-0 rounded-full px-3.5 py-1.5 font-tmono text-[9px] uppercase tracking-[0.1em] text-black"
                              style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                            >
                              {r.requireApproval ? "request" : "join"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ---------------- WAITING ---------------- */}
              {(room.status === "waiting" || room.status === "requesting") && (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[var(--acc0)]" />
                  <div>
                    <p className="font-display text-base font-bold text-[var(--ink)]">Waiting for host approval…</p>
                    <p className="mt-1.5 text-[12.5px] text-[var(--dim)]">You'll enter once the host approves your request.</p>
                  </div>
                  <button onClick={room.leave} className="mt-2 rounded-full border border-white/12 px-4 py-2 font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)] hover:text-white">
                    cancel
                  </button>
                </div>
              )}

              {/* ---------------- IN ROOM ---------------- */}
              {inRoom && room.room && (
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  {/* room head + invite */}
                  <div className="rounded-[var(--radius)] border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-display text-[15px] font-bold text-[var(--ink)]">
                          {room.room.type === "private" ? <LockIcon size={13} className="text-[var(--acc0)]" /> : <GlobeIcon size={13} className="text-[var(--acc0)]" />}
                          <span className="truncate">{room.room.name}</span>
                        </p>
                        <p className="mt-1 font-tmono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]">
                          {room.room.type} · {room.online} listening
                        </p>
                      </div>
                      <div className="shrink-0 rounded-[var(--radius-s)] border border-[var(--acc0)]/30 bg-[var(--acc0)]/10 px-2.5 py-1.5 text-center">
                        <p className="font-display text-[16px] font-extrabold tracking-[0.15em] text-[var(--acc0)]">{room.room.code}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => copy(room.room!.code, "Code")} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/12 py-2 font-tmono text-[9px] uppercase tracking-[0.12em] text-[var(--dim)] hover:text-[var(--acc0)]">
                        <CopyIcon size={12} /> code
                      </button>
                      <button onClick={() => copy(inviteLink(room.room!.code), "Invite link")} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/12 py-2 font-tmono text-[9px] uppercase tracking-[0.12em] text-[var(--dim)] hover:text-[var(--acc0)]">
                        <CopyIcon size={12} /> link
                      </button>
                    </div>
                    {!controls && (
                      <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-white/4 px-2.5 py-1.5 font-tmono text-[8.5px] uppercase tracking-[0.1em] text-[var(--dim)]">
                        <LockIcon size={11} /> host controls playback · your volume is local
                      </p>
                    )}
                  </div>

                  {/* In-room Navigation Tabs */}
                  <div className={cn(
                    "grid gap-1 rounded-[var(--radius-s)] border border-white/8 bg-white/[0.04] p-1 shrink-0",
                    room.isHost ? "grid-cols-3" : "grid-cols-2"
                  )}>
                    <button
                      onClick={() => setInRoomTab("chat")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md py-2 font-tmono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                        inRoomTab === "chat"
                          ? "bg-[var(--acc0)] text-black font-bold"
                          : "text-[var(--dim)] hover:text-white hover:bg-white/4"
                      )}
                    >
                      <ChatIcon size={12} />
                      <span>Chat</span>
                    </button>
                    <button
                      onClick={() => setInRoomTab("people")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md py-2 font-tmono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                        inRoomTab === "people"
                          ? "bg-[var(--acc0)] text-black font-bold"
                          : "text-[var(--dim)] hover:text-white hover:bg-white/4"
                      )}
                    >
                      <GroupIcon size={14} />
                      <span>People ({room.online})</span>
                    </button>
                    {room.isHost && (
                      <button
                        onClick={() => setInRoomTab("settings")}
                        className={cn(
                          "relative flex items-center justify-center gap-1.5 rounded-md py-2 font-tmono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                          inRoomTab === "settings"
                            ? "bg-[var(--acc0)] text-black font-bold"
                            : "text-[var(--dim)] hover:text-white hover:bg-white/4"
                        )}
                      >
                        <CrownIcon size={12} />
                        <span>Settings</span>
                        {room.requests.length > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#ff6b7a] text-[8.5px] font-bold text-white shadow-sm">
                            {room.requests.length}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* TAB 1: LIVE CHAT (Spacious, full height) */}
                  {inRoomTab === "chat" && (
                    <div className="flex min-h-[400px] flex-1 flex-col rounded-[var(--radius)] border border-white/8 bg-white/[0.03] p-3">
                      {/* Host join request notice banner if pending */}
                      {room.isHost && room.requests.length > 0 && (
                        <button
                          onClick={() => setInRoomTab("settings")}
                          className="mb-2.5 flex items-center justify-between rounded-lg border border-[var(--acc0)]/30 bg-[var(--acc0)]/10 px-3 py-2 text-[11px] text-[var(--acc0)] transition-colors hover:bg-[var(--acc0)]/20 shrink-0"
                        >
                            <span className="flex items-center gap-1.5 font-medium">
                            <NotificationsIcon size={14} /> {room.requests.length} join request{room.requests.length > 1 ? "s" : ""} pending
                          </span>
                          <span className="font-tmono text-[9px] uppercase tracking-[0.1em] underline">Settings →</span>
                        </button>
                      )}

                      <div className="mb-2 flex items-center justify-between px-1 shrink-0">
                        <p className="flex items-center gap-1.5 font-tmono text-[9.5px] uppercase tracking-[0.2em] text-[var(--dim)]">
                          <ChatIcon size={13} /> Live Chat
                          {!(room.room.chatEnabled ?? true) && (
                            <span className="text-[#ff9aa6] font-normal tracking-normal">(Muted by Host)</span>
                          )}
                        </p>
                        {room.isHost && (
                          <button
                            onClick={room.clearChat}
                            className="font-tmono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)] hover:text-[#ff9aa6]"
                          >
                            clear chat
                          </button>
                        )}
                      </div>

                      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                        {room.chat.length === 0 && (
                          <p className="py-12 text-center font-tmono text-[9.5px] uppercase tracking-[0.14em] text-[var(--dim)]/60">
                            say hello to the room
                          </p>
                        )}
                        {room.chat.map((c) => (
                          <div key={c.id} className={cn("group flex flex-col", c.mine ? "items-end" : "items-start")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3.5 py-2",
                                c.mine
                                  ? "bg-[var(--acc0)]/20 text-[var(--ink)] border border-[var(--acc0)]/25"
                                  : "bg-white/8 text-[var(--ink)] border border-white/10"
                              )}
                            >
                              {!c.mine && (
                                <p className="mb-0.5 font-tmono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[var(--acc1)]">
                                  {c.nickname}
                                </p>
                              )}
                              <p className="break-words text-[13px] leading-relaxed">{c.message}</p>
                            </div>
                            {(c.mine || room.isHost) && (
                              <button
                                onClick={() => room.deleteChat(c.id)}
                                className="mt-0.5 font-tmono text-[8px] uppercase tracking-[0.1em] text-[var(--dim)]/0 transition-colors group-hover:text-[var(--dim)] hover:!text-[#ff9aa6]"
                              >
                                delete
                              </button>
                            )}
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Chat Input or Muted Notice */}
                      {(room.room.chatEnabled ?? true) || room.isHost ? (
                        <div className="mt-2.5 flex gap-2 shrink-0">
                          <input
                            value={chatDraft}
                            onChange={(e) => setChatDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && chatDraft.trim()) {
                                room.sendChat(chatDraft);
                                setChatDraft("");
                              }
                            }}
                            placeholder="Type a message to room…"
                            className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/6 px-4 py-2.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
                          />
                          <button
                            onClick={() => {
                              if (chatDraft.trim()) {
                                room.sendChat(chatDraft);
                                setChatDraft("");
                              }
                            }}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-black transition-transform active:scale-95 shadow-md"
                            style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                            aria-label="Send"
                          >
                            <SendIcon size={16} />
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 rounded-lg bg-white/4 py-2.5 text-center font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)] shrink-0">
                          Chat is currently disabled by host
                        </p>
                      )}
                    </div>
                  )}

                  {/* TAB 2: PEOPLE LIST */}
                  {inRoomTab === "people" && (
                    <div className="flex flex-1 flex-col gap-3">
                      <div className="rounded-[var(--radius)] border border-white/8 bg-white/[0.03] p-3.5">
                        <p className="mb-2 px-1 font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)]">
                          Active Listeners · {room.online}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {room.members.map((m) => (
                            <div key={m.id} className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/4">
                              <span
                                className={cn(
                                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                                  m.role === "host"
                                    ? "bg-[var(--acc0)]/15 text-[var(--acc0)]"
                                    : "bg-white/8 text-[var(--dim)]"
                                )}
                              >
                                {m.role === "host" ? <CrownIcon size={14} /> : m.nickname.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--ink)]">
                                {m.nickname}
                                {m.id === room.me && <span className="text-[var(--dim)]"> (you)</span>}
                                {m.role === "host" && (
                                  <span className="ml-1.5 rounded bg-[var(--acc0)]/20 px-1.5 py-0.5 font-tmono text-[8px] font-semibold text-[var(--acc0)]">
                                    HOST
                                  </span>
                                )}
                              </span>
                              {room.isHost && m.id !== room.me && (
                                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    onClick={() => room.transferHost(m.id)}
                                    title="Make host"
                                    className="rounded px-2 py-1 font-tmono text-[8.5px] uppercase tracking-[0.1em] text-[var(--dim)] hover:text-[var(--acc0)] hover:bg-white/6"
                                  >
                                    host
                                  </button>
                                  <button
                                    onClick={() => room.kick(m.id)}
                                    title="Remove"
                                    className="rounded p-1 text-[var(--dim)] hover:text-[#ff9aa6] hover:bg-[#ff6b7a]/10"
                                  >
                                    <CloseIcon size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-auto pt-2">
                        {room.isHost ? (
                          <button
                            onClick={room.closeRoom}
                            className="w-full rounded-[var(--radius-s)] border border-[#ff6b7a]/35 bg-[#ff6b7a]/10 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.12em] text-[#ff9aa6] hover:bg-[#ff6b7a]/20"
                          >
                            close room for everyone
                          </button>
                        ) : (
                          <button
                            onClick={room.leave}
                            className="w-full rounded-[var(--radius-s)] border border-white/12 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.12em] text-[var(--dim)] hover:text-white hover:bg-white/6"
                          >
                            leave room
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: HOST SETTINGS (Host only) */}
                  {inRoomTab === "settings" && room.isHost && (
                    <div className="flex flex-1 flex-col gap-3.5">
                      {/* Pending Join Requests */}
                      {room.requests.length > 0 && (
                        <div className="rounded-[var(--radius)] border border-[var(--acc0)]/30 bg-[var(--acc0)]/[0.08] p-3.5">
                          <p className="mb-2.5 flex items-center justify-between font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--acc0)]">
                            <span>Pending Join Requests</span>
                            <span className="rounded-full bg-[var(--acc0)]/20 px-2 py-0.5 text-[8.5px] font-bold">
                              {room.requests.length}
                            </span>
                          </p>
                          <div className="flex flex-col gap-2">
                            {room.requests.map((r) => (
                              <div key={r.userId} className="flex items-center gap-2 rounded-lg bg-black/20 p-2">
                                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--ink)]">
                                  {r.nickname}
                                </span>
                                <button
                                  onClick={() => room.approve(r.userId)}
                                  className="rounded-lg px-3 py-1.5 font-tmono text-[9px] uppercase tracking-[0.1em] text-black font-semibold shadow-sm"
                                  style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc2))" }}
                                >
                                  approve
                                </button>
                                <button
                                  onClick={() => room.reject(r.userId)}
                                  className="rounded-lg border border-white/14 px-2.5 py-1.5 font-tmono text-[9px] uppercase tracking-[0.1em] text-[var(--dim)] hover:text-[#ff9aa6]"
                                >
                                  reject
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Host Control Panel */}
                      <div className="rounded-[var(--radius)] border border-[var(--acc0)]/30 bg-[var(--acc0)]/[0.05] p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="flex items-center gap-1.5 font-display text-[12.5px] font-bold uppercase tracking-[0.14em] text-[var(--acc0)]">
                            <CrownIcon size={15} /> Host Control Panel
                          </p>
                          <span className="rounded bg-[var(--acc0)]/15 px-2.5 py-0.5 font-tmono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[var(--acc0)]">
                            Authoritative
                          </span>
                        </div>

                        {/* Chat Permission Toggle */}
                        <div className="flex items-center justify-between border-t border-white/8 pt-3">
                          <div>
                            <p className="text-[12px] font-medium text-[var(--ink)]">Room Live Chat</p>
                            <p className="text-[10px] text-[var(--dim)]">Allow members to send chat messages</p>
                          </div>
                          <Switch
                            on={room.room.chatEnabled ?? true}
                            onChange={(v: boolean) => room.setChatEnabled(v)}
                            label="Room Live Chat"
                          />
                        </div>

                        {/* Music Control Mode Toggle */}
                        <div className="border-t border-white/8 pt-3">
                          <p className="mb-2 font-tmono text-[9.5px] uppercase tracking-[0.18em] text-[var(--dim)]">
                            Music Control Mode
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => room.updatePermissions(HOST_ONLY_PERMS)}
                              className={cn(
                                "rounded-lg border p-2.5 text-left transition-colors",
                                !room.permissions.play_pause
                                  ? "border-[var(--acc0)] bg-[var(--acc0)]/15 text-[var(--acc0)]"
                                  : "border-white/10 text-[var(--dim)] hover:text-white"
                              )}
                            >
                              <span className="block font-display text-[11px] font-bold">Host Only</span>
                              <span className="block text-[9px] opacity-80 mt-0.5">Only you can seek / play</span>
                            </button>
                            <button
                              onClick={() => room.updatePermissions(SHARED_PERMS)}
                              className={cn(
                                "rounded-lg border p-2.5 text-left transition-colors",
                                room.permissions.play_pause
                                  ? "border-[var(--acc0)] bg-[var(--acc0)]/15 text-[var(--acc0)]"
                                  : "border-white/10 text-[var(--dim)] hover:text-white"
                              )}
                            >
                              <span className="block font-display text-[11px] font-bold">Shared Sync</span>
                              <span className="block text-[9px] opacity-80 mt-0.5">Members can control</span>
                            </button>
                          </div>
                        </div>

                        {/* Detailed member permissions when in shared mode */}
                        <div className="border-t border-white/8 pt-3">
                          <p className="mb-2.5 font-tmono text-[9.5px] uppercase tracking-[0.18em] text-[var(--dim)]">
                            Member Playback Permissions
                          </p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            {PERM_LABELS.map(([key, label]) => (
                              <div key={key} className="flex items-center justify-between">
                                <span className="text-[11.5px] text-[var(--ink)]">{label}</span>
                                <Switch
                                  on={room.permissions[key]}
                                  onChange={(v: boolean) => room.updatePermissions({ ...room.permissions, [key]: v })}
                                  label={label}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Close room */}
                      <div className="mt-auto pt-2">
                        <button
                          onClick={room.closeRoom}
                          className="w-full rounded-[var(--radius-s)] border border-[#ff6b7a]/35 bg-[#ff6b7a]/10 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.12em] text-[#ff9aa6] hover:bg-[#ff6b7a]/20"
                        >
                          close room for everyone
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
