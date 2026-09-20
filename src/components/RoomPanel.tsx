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
  MicIcon,
  ShieldIcon,
  NotificationsIcon,
  SendIcon,
  Switch,
} from "./UiIcons";
import { VoicePanel } from "./VoicePanel";

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
  const [editingNick, setEditingNick] = useState(false);
  const [editingNickVal, setEditingNickVal] = useState("");
  const nickInputRef = useRef<HTMLInputElement>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [inRoomTab, setInRoomTab] = useState<"voice" | "chat" | "settings" | "people">("chat");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNick(room.nickname);
  }, [room.nickname]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.chat.length, room.typingUsers.length]);

  useEffect(() => {
    if (open && inRoomTab === "chat") {
      room.markChatAsRead();
    }
  }, [open, inRoomTab, room.chat.length, room.markChatAsRead]);

  const ensureNick = (): boolean => {
    const val = (nick || room.nickname || "").trim();
    if (!val) {
      onToast("Please enter your name first!");
      nickInputRef.current?.focus();
      return false;
    }
    return true;
  };

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
            className="fixed right-0 top-0 z-[66] flex h-[100dvh] w-full max-w-[min(620px,100vw)] sm:w-[500px] md:w-[540px] lg:w-[580px] xl:w-[620px] flex-col border-l border-white/10 shadow-[-16px_0_48px_rgba(0,0,0,0.65)]"
            style={{ background: "linear-gradient(180deg, rgba(9,14,22,0.98), rgba(6,10,17,0.99))", backdropFilter: "blur(26px)", paddingBottom: "env(safe-area-inset-bottom)" }}
            aria-label="Room panel"
          >
            {/* header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-6 py-4">
              <h3 className="flex items-center gap-2.5 font-display text-[16px] font-bold tracking-[0.05em] text-[var(--ink)]">
                <HeadphonesIcon size={18} className="text-[var(--acc0)]" /> Listen Together
                {inRoom && (
                  <span
                    className="ml-1.5 flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-tmono text-[8.5px] uppercase tracking-[0.12em]"
                    style={{ color: room.connection === "connected" ? "var(--acc2)" : "var(--dim)" }}
                  >
                    <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: room.connection === "connected" ? "var(--acc2)" : "#f5a97f" }} />
                    {room.connection === "connected" ? "live" : "reconnecting"}
                  </span>
                )}
              </h3>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--dim)] transition-colors hover:bg-white/8 hover:text-white" aria-label="Close">
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
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
                    <p className="mb-2 font-tmono text-[9px] uppercase tracking-[0.24em] text-[var(--dim)]">
                      Your name <span className="text-[var(--acc0)]">*</span>
                    </p>
                    <input
                      ref={nickInputRef}
                      value={nick}
                      onChange={(e) => {
                        setNick(e.target.value);
                        const clean = e.target.value.trim();
                        if (clean && clean !== "false") {
                          room.updateNickname(clean);
                        }
                      }}
                      onBlur={() => {
                        const clean = (nick || "").trim();
                        if (clean && clean !== "false") {
                          room.updateNickname(clean);
                        } else {
                          setNick(room.nickname);
                        }
                      }}
                      placeholder="Enter your name (required)"
                      className="w-full rounded-[var(--radius-s)] border border-white/12 bg-white/6 px-3 py-2.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
                    />
                  </div>

                  {/* active public rooms directory (shown immediately below name input) */}
                  <div className="rounded-[var(--radius)] border border-white/8 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
                        <GlobeIcon size={13} className="text-[var(--acc0)]" /> Active Public Rooms
                      </p>
                      <span className="font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]">
                        {room.publicRooms.length} live
                      </span>
                    </div>
                    {room.publicRooms.length === 0 ? (
                      <p className="rounded-[var(--radius-s)] border border-white/8 bg-white/[0.02] px-3 py-4 text-center font-tmono text-[9px] uppercase tracking-[0.14em] text-[var(--dim)]/60">
                        no public rooms right now — create one below!
                      </p>
                    ) : (
                      <div className="scroll-slim flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-0.5">
                        {room.publicRooms.map((r) => (
                          <div key={r.code} className="flex items-center gap-3 rounded-[var(--radius-s)] border border-white/8 bg-white/[0.03] p-2.5 hover:border-white/15 transition-all">
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
                              onClick={() => {
                                if (!ensureNick()) return;
                                room.joinRoom(r.code, nick);
                              }}
                              className="shrink-0 rounded-full px-3.5 py-1.5 font-tmono text-[9px] uppercase tracking-[0.1em] text-black font-semibold shadow-sm"
                              style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                            >
                              {r.requireApproval ? "request" : "join"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* join with invite code (positioned above create a room) */}
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
                          if (!ensureNick()) return;
                          room.joinRoom(joinCode, nick);
                        }}
                        className="shrink-0 rounded-[var(--radius-s)] px-5 font-tmono text-[10.5px] uppercase tracking-[0.14em] text-black font-semibold"
                        style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                      >
                        Enter
                      </button>
                    </div>
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
                        if (!ensureNick()) return;
                        const info = room.createRoom({ name, type, requireApproval: approval, control, chatEnabled: allowChat, nickname: nick });
                        if (info) onToast(`Room ${info.code} created`);
                      }}
                      className="mt-2 w-full rounded-[var(--radius-s)] py-2.5 font-tmono text-[10px] uppercase tracking-[0.14em] text-black"
                      style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                    >
                      Create room
                    </button>
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
                    room.isHost ? "grid-cols-4" : "grid-cols-3"
                  )}>
                    <button
                      onClick={() => setInRoomTab("voice")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md py-2 font-tmono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                        inRoomTab === "voice"
                          ? "bg-[var(--acc0)] text-black font-bold shadow-sm"
                          : "text-[var(--dim)] hover:text-white hover:bg-white/4"
                      )}
                    >
                      <MicIcon size={12} />
                      <span>Voice</span>
                      {room.voice.isInVoice && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    </button>
                    <button
                      onClick={() => setInRoomTab("chat")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md py-2 font-tmono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                        inRoomTab === "chat"
                          ? "bg-[var(--acc0)] text-black font-bold shadow-sm"
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
                          ? "bg-[var(--acc0)] text-black font-bold shadow-sm"
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
                            ? "bg-[var(--acc0)] text-black font-bold shadow-sm"
                            : "text-[var(--dim)] hover:text-white hover:bg-white/4"
                        )}
                      >
                        <CrownIcon size={12} />
                        <span>Host</span>
                        {room.requests.length > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--acc1)] text-[9px] font-bold text-black">
                            {room.requests.length}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Floating Mini Voice Bar (when connected to voice but viewing chat or people) */}
                  {room.voice.isInVoice && inRoomTab !== "voice" && (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 shrink-0 backdrop-blur-md">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <span className="font-display text-[11px] font-bold text-white truncate">Voice Active</span>
                        <span className="font-tmono text-[9.5px] text-[var(--dim)] shrink-0">({room.voice.voiceCount})</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={room.voice.toggleSelfMute}
                          className="rounded-lg bg-white/10 px-2 py-1 font-tmono text-[9px] font-semibold text-white hover:bg-white/15"
                        >
                          {room.voice.selfMuted ? "Unmute" : "Mute"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setInRoomTab("voice")}
                          className="rounded-lg bg-[var(--acc0)] px-2 py-1 font-tmono text-[9px] font-bold text-black"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 0: VOICE */}
                  {inRoomTab === "voice" && (
                    <div className="flex flex-1 min-h-0 flex-col">
                      <VoicePanel room={room} onToast={onToast} isMobile={false} />
                    </div>
                  )}

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

                      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
                        {room.chat.length === 0 && (
                          <p className="py-12 text-center font-tmono text-[9.5px] uppercase tracking-[0.14em] text-[var(--dim)]/60">
                            say hello to the room
                          </p>
                        )}
                        {room.chat.map((c) => {
                          if (c.system) {
                            return (
                              <div key={c.id} className="my-1 flex justify-center">
                                <span className="rounded-full border border-white/8 bg-white/6 px-3 py-1 font-tmono text-[9.5px] text-[var(--dim)]">
                                  {c.message}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div key={c.id} className={cn("group flex flex-col", c.mine ? "items-end" : "items-start")}>
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm transition-all",
                                  c.mine
                                    ? "border border-[var(--acc0)]/30 bg-[var(--acc0)]/20 text-[var(--ink)]"
                                    : "border border-white/10 bg-white/8 text-[var(--ink)]"
                                )}
                              >
                                {!c.mine && (
                                  <p className="mb-0.5 font-tmono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[var(--acc1)]">
                                    {c.nickname}
                                  </p>
                                )}
                                <p className="break-words text-[13px] leading-relaxed">{c.message}</p>
                              </div>

                              {/* Message Status & Timestamp Row */}
                              <div className={cn("mt-1 flex items-center gap-1.5 px-1 font-tmono text-[8.5px] text-[var(--dim)]", c.mine ? "justify-end" : "justify-start")}>
                                <span>{new Date(c.ts || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                {c.mine && (
                                  <div className="flex items-center gap-1">
                                    {c.status === "sending" && (
                                      <span className="flex items-center gap-1 text-[var(--dim)]">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--acc0)] animate-ping" /> sending…
                                      </span>
                                    )}
                                    {c.status === "sent" && (
                                      <span className="text-[var(--dim)]" title="Sent to server">
                                        ✓ <span className="text-[8px] opacity-75">sent</span>
                                      </span>
                                    )}
                                    {c.status === "delivered" && (
                                      <span className="text-[var(--dim)] font-medium" title="Delivered to room">
                                        ✓✓ <span className="text-[8px] opacity-75">delivered</span>
                                      </span>
                                    )}
                                    {c.status === "read" && (
                                      <span className="text-[var(--acc0)] font-bold drop-shadow-sm" title="Seen by room">
                                        ✓✓ <span className="text-[8px]">read</span>
                                      </span>
                                    )}
                                    {c.status === "failed" && (
                                      <span className="flex items-center gap-1 text-[#ff6b7a]">
                                        <span>failed</span>
                                        <button
                                          type="button"
                                          onClick={() => room.retryChat(c.id)}
                                          className="rounded bg-[#ff6b7a]/20 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-[#ffb3ba] hover:bg-[#ff6b7a]/30"
                                        >
                                          retry
                                        </button>
                                      </span>
                                    )}
                                  </div>
                                )}
                                {(c.mine || room.isHost) && (
                                  <button
                                    onClick={() => room.deleteChat(c.id)}
                                    className="text-[8px] uppercase tracking-[0.1em] text-[var(--dim)]/0 transition-colors group-hover:text-[var(--dim)] hover:!text-[#ff9aa6]"
                                  >
                                    delete
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Real-time Typing Indicator Bubble */}
                        {room.typingUsers && room.typingUsers.length > 0 && (
                          <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-3 py-1.5 font-tmono text-[9.5px] text-[var(--dim)] w-fit animate-pulse my-1">
                            <div className="flex gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--acc0)] animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--acc0)] animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--acc0)] animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                            <span>
                              {room.typingUsers.length === 1
                                ? `${room.typingUsers[0]} is typing…`
                                : room.typingUsers.length === 2
                                  ? `${room.typingUsers[0]} and ${room.typingUsers[1]} are typing…`
                                  : `${room.typingUsers[0]} and ${room.typingUsers.length - 1} others are typing…`}
                            </span>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Chat Input or Muted Notice */}
                      {(room.room?.chatEnabled ?? true) || room.isHost ? (
                        <div className="mt-2.5 flex gap-2 shrink-0">
                          <input
                            value={chatDraft}
                            onChange={(e) => {
                              setChatDraft(e.target.value);
                              room.sendTyping(e.target.value.trim().length > 0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && chatDraft.trim()) {
                                e.preventDefault();
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
                                  m.role === "owner"
                                    ? "bg-[var(--acc0)]/20 text-[var(--acc0)] ring-1 ring-[var(--acc0)]/40"
                                    : m.role === "host"
                                    ? "bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/30"
                                    : "bg-white/8 text-[var(--dim)]"
                                )}
                              >
                                {m.role === "owner" ? <CrownIcon size={14} /> : m.role === "host" ? <ShieldIcon size={13} /> : m.nickname.slice(0, 1).toUpperCase()}
                              </span>
                              {editingNick && m.id === room.me ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const clean = editingNickVal.trim();
                                    if (clean && clean !== "false") {
                                      room.updateNickname(clean);
                                      setEditingNick(false);
                                    }
                                  }}
                                  className="flex items-center gap-1.5 flex-1 min-w-0"
                                >
                                  <input
                                    value={editingNickVal}
                                    onChange={(e) => setEditingNickVal(e.target.value)}
                                    autoFocus
                                    maxLength={24}
                                    className="rounded border border-[var(--acc0)]/60 bg-white/10 px-2 py-0.5 text-[12px] text-white outline-none w-28"
                                  />
                                  <button
                                    type="submit"
                                    className="rounded bg-[var(--acc0)] px-2 py-0.5 text-[10px] font-bold text-black hover:brightness-110"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingNick(false)}
                                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--dim)] hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--ink)] flex items-center gap-1.5">
                                  <span className="truncate">{m.nickname}</span>
                                  {m.id === room.me && (
                                    <>
                                      <span className="text-[var(--dim)] text-[11px]">(you)</span>
                                      <button
                                        onClick={() => {
                                          setEditingNickVal(m.nickname);
                                          setEditingNick(true);
                                        }}
                                        title="Change your nickname"
                                        className="rounded px-1.5 py-0.5 font-tmono text-[8px] uppercase tracking-wider text-[var(--dim)] hover:text-[var(--acc0)] hover:bg-white/6"
                                      >
                                        edit
                                      </button>
                                    </>
                                  )}
                                  {m.role === "owner" && (
                                    <span className="ml-1.5 rounded bg-[var(--acc0)]/20 px-1.5 py-0.5 font-tmono text-[8px] font-bold text-[var(--acc0)]">
                                      OWNER
                                    </span>
                                  )}
                                  {m.role === "host" && (
                                    <span className="ml-1.5 rounded bg-cyan-400/20 px-1.5 py-0.5 font-tmono text-[8px] font-bold text-cyan-300">
                                      CO-HOST
                                    </span>
                                  )}
                                </span>
                              )}
                              {room.isHost && m.id !== room.me && m.role !== "owner" && (room.isOwner || m.role !== "host") && (
                                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  {room.isOwner && (
                                    <button
                                      onClick={() => (m.role === "member" ? room.promoteToHost(m.id) : room.demoteHost(m.id))}
                                      title={m.role === "member" ? "Promote to Co-Host" : "Demote to Member"}
                                      className="rounded px-2 py-1 font-tmono text-[8.5px] uppercase tracking-[0.1em] text-[var(--dim)] hover:text-cyan-300 hover:bg-cyan-500/10"
                                    >
                                      {m.role === "member" ? "make host" : "demote"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => room.kick(m.id)}
                                    title="Remove from room"
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
                        <button
                          onClick={room.leave}
                          className="w-full rounded-[var(--radius-s)] border border-white/12 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.12em] text-[var(--dim)] hover:text-white hover:bg-white/6 transition-colors"
                        >
                          leave room
                        </button>
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
