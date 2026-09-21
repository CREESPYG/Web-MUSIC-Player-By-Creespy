import { useEffect, useRef, useState } from "react";
import type { RoomApi } from "../../../hooks/useRoom";
import type { Permissions } from "../../../lib/room";
import { Switch, CopyIcon, HeadphonesIcon, CrownIcon, GlobeIcon, LockIcon, SettingsIcon, ChatIcon, GroupIcon, SendIcon, MicIcon, ShieldIcon } from "../../UiIcons";
import { VoicePanel } from "../../VoicePanel";

interface Props {
  room: RoomApi;
  onToast: (msg: string) => void;
}

type RoomTab = "hub" | "voice" | "chat" | "controls" | "members";

const EMOJIS = ["❤️", "🔥", "🎵", "👏", "🎉", "⚡", "✨", "🙌"];

const PERM_LABELS: [keyof Permissions, string][] = [
  ["play_pause", "Play / Pause"],
  ["next", "Skip to Next"],
  ["previous", "Skip to Previous"],
  ["seek", "Seek & Scrub"],
  ["add_song", "Add Songs"],
  ["shuffle", "Toggle Shuffle"],
];

export function MobileRoomScreen({ room, onToast }: Props) {
  const [tab, setTab] = useState<RoomTab>("hub");
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [nick, setNick] = useState(room.nickname);
  const [editingNick, setEditingNick] = useState(false);
  const [editingNickVal, setEditingNickVal] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNick(room.nickname);
  }, [room.nickname]);

  useEffect(() => {
    if (tab === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.chat.length, tab]);

  useEffect(() => {
    if (tab === "chat") {
      room.markChatAsRead();
    }
  }, [tab, room.chat.length, room.markChatAsRead]);

  const copyInvite = () => {
    const code = room.room?.code;
    if (!code) return;
    const url = `${window.location.origin}/?room=${code}`;
    navigator.clipboard?.writeText(url).then(() => onToast("Invite link copied!")).catch(() => onToast("Copy failed"));
  };

  const handleSendChat = (text?: string) => {
    const msg = (text || chatDraft).trim();
    if (!msg) return;
    room.sendChat(msg);
    if (!text) setChatDraft("");
  };

  const ensureNick = (): boolean => {
    const val = (nick || room.nickname || "").trim();
    if (!val) {
      onToast("Please enter your nickname first!");
      return false;
    }
    return true;
  };

  // ─── LOBBY ───
  if (!room.inRoom) {
    return (
      <div className="scroll-slim flex h-full flex-col gap-3 overflow-y-auto px-4 py-3 pb-8">
        {/* Nickname */}
        <div>
          <label className="mb-1 block font-tmono text-[10px] uppercase tracking-wider text-[var(--dim)]">
            Your Nickname <span className="text-[var(--acc0)]">*</span>
          </label>
          <input
            type="text"
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
            placeholder="Listener nickname (required)"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-body text-xs text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
          />
        </div>

        {/* Public Rooms */}
        {room.publicRooms.length > 0 && (
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--acc0)]/15 text-[var(--acc0)]">
                <GlobeIcon size={14} />
              </div>
              <h4 className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Live Rooms ({room.publicRooms.length})
              </h4>
            </div>
            <div className="flex flex-col gap-1.5">
              {room.publicRooms.map((pr) => (
                <button
                  key={pr.code}
                  type="button"
                  onClick={() => {
                    if (!ensureNick()) return;
                    room.joinRoom(pr.code, room.nickname || nick);
                  }}
                  className="flex items-center justify-between rounded-lg border border-white/6 bg-white/[0.03] px-2.5 py-2 text-left transition-all hover:border-white/15 active:scale-[0.98]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-display text-[11px] font-bold text-[var(--ink)]">{pr.name}</span>
                      {pr.requireApproval && <LockIcon size={10} className="shrink-0 text-[var(--dim)]" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-tmono text-[9px] text-[var(--acc0)]">#{pr.code}</span>
                      <span className="text-[9px] text-[var(--dim)]">by {pr.hostName}</span>
                      <span className="text-[9px] text-[var(--dim)]">· {pr.count} listening</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md px-2 py-1 font-display text-[9px] font-bold text-black" style={{ background: "var(--acc0)" }}>
                    Join
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Action Cards */}
        <div className="grid grid-cols-2 gap-2">
          {/* Join Card */}
          <div className="col-span-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--acc0)]/15 text-[var(--acc0)]">
                <HeadphonesIcon size={14} />
              </div>
              <h4 className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Join Room
              </h4>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB12"
                maxLength={8}
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 font-tmono text-xs uppercase tracking-widest text-[var(--ink)] placeholder:text-[var(--dim)]/40 focus:border-[var(--acc0)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!ensureNick()) return;
                  if (joinCode.trim()) room.joinRoom(joinCode.trim(), room.nickname || nick);
                }}
                disabled={!joinCode.trim()}
                className="rounded-lg px-3 py-2 font-display text-[11px] font-bold text-black disabled:opacity-40"
                style={{ background: "var(--acc0)" }}
              >
                Join
              </button>
            </div>
            {room.status === "requesting" && (
              <p className="mt-1.5 text-center font-tmono text-[10px] text-[var(--acc0)]">Requesting to join…</p>
            )}
            {room.status === "waiting" && (
              <p className="mt-1.5 text-center font-tmono text-[10px] text-[#facc15]">Waiting for host approval…</p>
            )}
            {room.status === "denied" && (
              <p className="mt-1.5 text-center font-tmono text-[10px] text-[#f43f5e]">Request denied. Try again.</p>
            )}
          </div>

          {/* Create Card */}
          <div className="col-span-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--acc0)]/15 text-[var(--acc0)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <h4 className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Create Room
              </h4>
            </div>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Room title (e.g. Midnight Beats)"
              className="mb-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-body text-xs text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
            />
            <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                {isPrivate ? <LockIcon size={13} /> : <GlobeIcon size={13} />}
                <span className="text-[11px] font-medium text-[var(--ink)]">
                  {isPrivate ? "Private" : "Public"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPrivate(!isPrivate)}
                className="rounded-md border border-white/10 px-2 py-0.5 font-tmono text-[9px] text-[var(--dim)] hover:text-white"
              >
                Switch
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!ensureNick()) return;
                room.createRoom({
                  name: createName.trim() || "Live Room",
                  type: isPrivate ? "private" : "public",
                  requireApproval: isPrivate,
                  control: "host",
                  chatEnabled: true,
                  nickname: nick,
                });
                setTab("hub");
              }}
              className="w-full rounded-lg py-2.5 font-display text-[11px] font-bold text-black shadow-lg active:scale-[0.98]"
              style={{ background: "var(--acc0)" }}
            >
              Create & Host
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── IN ROOM ───
  const roomCode = room.room?.code ?? "";
  const roomName = room.room?.name ?? "Live Room";
  const hostName = room.room?.hostName ?? "Host";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compact Room Header */}
      <div className="relative shrink-0 border-b border-white/8 bg-white/[0.02] px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--acc0)]/20 text-[var(--acc0)]">
              <HeadphonesIcon size={14} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-display text-[11px] font-bold text-[var(--ink)]">{roomName}</h3>
              <span className="font-tmono text-[9px] text-[var(--dim)]">
                <strong className="text-white">{roomCode}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 font-tmono text-[7px] uppercase tracking-wider"
              style={{
                background: room.connection === "connected" ? "rgba(74,222,128,0.15)" : "rgba(251,146,60,0.15)",
                color: room.connection === "connected" ? "#4ade80" : "#fb923c",
              }}
            >
              <span className="live-dot h-1 w-1 rounded-full" style={{ background: room.connection === "connected" ? "#4ade80" : "#fb923c" }} />
              {room.connection}
            </span>
            <button
              type="button"
              onClick={copyInvite}
              className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-white/5 text-[var(--dim)] hover:text-white active:scale-95"
              title="Copy invite link"
            >
              <CopyIcon size={12} />
            </button>
          </div>
        </div>

        {/* Compact Tab Bar */}
        <div className="mt-2 flex gap-0.5 rounded-lg border border-white/8 bg-white/[0.03] p-0.5">
          {(["hub", "voice", "chat", "controls", "members"] as RoomTab[]).map((t) => {
            const labels: Record<RoomTab, string> = { hub: "Room", voice: "Voice", chat: "Chat", controls: "Perms", members: "People" };
            const counts: Partial<Record<RoomTab, number>> = { 
              voice: room.voice.participants.length,
              chat: room.chat.length, 
              members: room.online 
            };
            const isActive = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="relative flex-1 rounded-md py-1 font-display text-[9px] font-bold uppercase tracking-wider transition-colors"
                style={{ background: isActive ? "var(--acc0)" : "transparent", color: isActive ? "#000" : "var(--dim)" }}
              >
                {t === "voice" && room.voice.inVoice && (
                  <span className="inline-block mr-1 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {labels[t]}
                {counts[t] !== undefined && counts[t]! > 0 && !isActive && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full px-0.5 font-tmono text-[6px] font-bold text-black"
                    style={{ background: t === "voice" ? "#10b981" : "var(--acc0)" }}
                  >
                    {counts[t]! > 99 ? "99+" : counts[t]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Floating Mini-Voice Bar if in voice and browsing other tabs */}
        {room.voice.inVoice && tab !== "voice" && (
          <div className="mt-1.5 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300">
            <button
              type="button"
              onClick={() => setTab("voice")}
              className="flex items-center gap-1.5 truncate font-display font-bold text-left"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Voice ({room.voice.participants.length})</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => room.voice.toggleMic()}
                className={`rounded px-1.5 py-0.5 font-tmono text-[9px] ${
                  room.voice.effectiveMicEnabled ? "bg-white/10 text-white" : "bg-red-500/20 text-red-300"
                }`}
              >
                {room.voice.effectiveMicEnabled ? "Mute" : "Unmute"}
              </button>
              <button
                type="button"
                onClick={() => room.voice.leaveVoice()}
                className="rounded bg-red-500/20 px-1.5 py-0.5 font-tmono text-[9px] text-red-300"
              >
                Leave
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* HUB TAB */}
        {tab === "hub" && (
          <div className="scroll-slim flex h-full flex-col gap-2 overflow-y-auto px-3 py-2 pb-8">
            {[
              { 
                icon: <MicIcon size={16} />, 
                label: "Room Voice", 
                sub: room.voice.inVoice ? `Connected (${room.voice.participants.length})` : (room.voice.voiceEnabled ? "Join voice chat" : "Voice disabled"), 
                to: "voice" as RoomTab,
                badge: room.voice.inVoice ? "Active" : undefined
              },
              { icon: <ChatIcon size={16} />, label: "Live Chat", sub: `${room.chat.length} messages`, to: "chat" as RoomTab },
              { icon: <SettingsIcon size={16} />, label: "Sync & Permissions", sub: room.isHost ? "Host controls" : "Listener sync", to: "controls" as RoomTab },
              { icon: <GroupIcon size={16} />, label: "Members", sub: `${room.online} online`, to: "members" as RoomTab },
            ].map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => setTab(item.to)}
                className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-2.5 text-left transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[var(--acc0)]">
                    {item.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h5 className="font-display text-[11px] font-bold text-[var(--ink)]">{item.label}</h5>
                      {item.badge && (
                        <span className="rounded bg-emerald-500/20 px-1 font-tmono text-[7px] text-emerald-400">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-[var(--dim)]">{item.sub}</p>
                  </div>
                </div>
                <span className="font-tmono text-[10px] text-[var(--dim)]">→</span>
              </button>
            ))}

            <div className="mt-auto pt-2">
              <button
                type="button"
                onClick={() => { room.leave(); onToast("Left the room"); }}
                className="w-full rounded-xl border border-[#ff6b7a]/30 bg-[#ff6b7a]/10 py-2.5 font-display text-[11px] font-bold text-[#ffb3ba] transition-colors hover:bg-[#ff6b7a]/20 active:scale-[0.98]"
              >
                Leave Room
              </button>
            </div>
          </div>
        )}

        {/* VOICE TAB */}
        {tab === "voice" && (
          <div className="h-full overflow-y-auto scroll-slim">
            <VoicePanel room={room} onToast={onToast} isMobile={true} />
          </div>
        )}

        {/* CHAT TAB */}
        {tab === "chat" && (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="scroll-slim flex flex-1 flex-col gap-1.5 overflow-y-auto p-3 pb-1">
              {room.chat.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                  <ChatIcon size={24} className="mb-2 text-[var(--dim)]/30" />
                  <p className="font-display text-[11px] font-semibold text-[var(--dim)]">No messages yet</p>
                  <p className="mt-0.5 text-[9px] text-[var(--dim)]/70">Say hello or react with an emoji!</p>
                </div>
              ) : (
                room.chat.map((c) => {
                  const isMe = c.mine === true;
                  const isSystem = c.system === true;

                  if (isSystem) {
                    return (
                      <div key={c.id} className="flex justify-center py-1">
                        <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 font-tmono text-[9px] text-[var(--dim)]">
                          {c.message}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={c.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className="mb-0.5 flex items-center gap-1 font-tmono text-[8px] text-[var(--dim)]/75">
                        {!isMe && <span>{c.nickname}</span>}
                        <span className="text-[7px]">
                          {new Date(c.ts || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-1.5 text-[11px] leading-relaxed shadow-sm ${
                          isMe ? "bg-[var(--acc0)] font-medium text-black" : "border border-white/10 bg-white/6 text-[var(--ink)]"
                        }`}
                      >
                        {c.message}
                      </div>

                      {/* Mobile Status Row for my messages */}
                      {isMe && (
                        <div className="mt-0.5 flex items-center gap-1 font-tmono text-[8px] text-[var(--dim)]">
                          {c.status === "sending" && (
                            <span className="flex items-center gap-1">
                              <span className="h-1 w-1 rounded-full bg-[var(--acc0)] animate-ping" /> sending
                            </span>
                          )}
                          {c.status === "sent" && <span>✓ sent</span>}
                          {c.status === "delivered" && <span>✓✓ delivered</span>}
                          {c.status === "read" && <span className="text-[var(--acc0)] font-bold">✓✓ read</span>}
                          {c.status === "failed" && (
                            <span className="text-[#ff6b7a] flex items-center gap-1">
                              failed ·
                              <button
                                type="button"
                                onClick={() => room.retryChat(c.id)}
                                className="underline font-bold text-[#ffb3ba]"
                              >
                                retry
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Mobile Typing indicator */}
              {room.typingUsers && room.typingUsers.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 font-tmono text-[8.5px] text-[var(--dim)] w-fit animate-pulse my-0.5">
                  <div className="flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-[var(--acc0)] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1 w-1 rounded-full bg-[var(--acc0)] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1 w-1 rounded-full bg-[var(--acc0)] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span>
                    {room.typingUsers.length === 1
                      ? `${room.typingUsers[0]} is typing…`
                      : `${room.typingUsers[0]} and ${room.typingUsers.length - 1} more typing…`}
                  </span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="shrink-0 border-t border-white/8 bg-black/40 p-2 backdrop-blur-xl">
              <div className="mb-1.5 flex items-center gap-0.5 overflow-x-auto">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSendChat(emoji)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/5 text-sm transition-transform active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={chatDraft}
                  onChange={(e) => {
                    setChatDraft(e.target.value);
                    room.sendTyping(e.target.value.trim().length > 0);
                  }}
                  placeholder="Type a message…"
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-body text-[11px] text-[var(--ink)] placeholder:text-[var(--dim)]/50 focus:border-[var(--acc0)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatDraft.trim()}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black shadow-md transition-transform disabled:opacity-30 active:scale-95"
                  style={{ background: "var(--acc0)" }}
                >
                  <SendIcon size={13} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* CONTROLS TAB */}
        {tab === "controls" && (
          <div className="scroll-slim flex h-full flex-col gap-2 overflow-y-auto px-3 py-2 pb-8">
            {/* Role Banner */}
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
              <div>
                <h4 className="font-display text-[11px] font-bold text-[var(--ink)]">Your Role</h4>
                <p className="text-[9px] text-[var(--dim)]">
                  {room.isHost ? "Room Host — Full Control" : "Listener — Synced Playback"}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 font-tmono text-[9px] font-bold"
                style={{
                  background: room.isHost ? "var(--acc0)" : "rgba(255,255,255,0.1)",
                  color: room.isHost ? "#000" : "var(--ink)",
                }}
              >
                {room.isHost ? "Host" : "Listener"}
              </span>
            </div>

            {/* Permissions */}
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <h4 className="mb-1 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Permissions
              </h4>
              <p className="mb-2 text-[9px] text-[var(--dim)]">
                {room.isHost ? "Toggle what listeners can do." : "Set by host."}
              </p>
              <div className="flex flex-col divide-y divide-white/6">
                {PERM_LABELS.map(([key, label]) => {
                  const enabled = room.permissions?.[key] ?? false;
                  return (
                    <div key={key} className="flex items-center justify-between py-2">
                      <span className="text-[11px] text-[var(--ink)]">{label}</span>
                      <Switch
                        on={enabled}
                        onChange={(val) => {
                          if (!room.isHost) { onToast("Only host can modify"); return; }
                          room.updatePermissions({ ...room.permissions, [key]: val });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sync Info */}
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <h4 className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Sync Status
              </h4>
              <div className="flex flex-col gap-1.5 font-tmono text-[10px]">
                <div className="flex justify-between text-[var(--dim)]">
                  <span>Connection</span>
                  <span className="text-white">{room.connection}</span>
                </div>
                <div className="flex justify-between text-[var(--dim)]">
                  <span>Room Code</span>
                  <span className="text-[var(--acc0)]">{roomCode || "None"}</span>
                </div>
                <div className="flex justify-between text-[var(--dim)]">
                  <span>Members Online</span>
                  <span className="text-white">{room.online}</span>
                </div>
              </div>
            </div>

            {room.isHost ? (
              <button
                type="button"
                onClick={() => {
                  room.closeRoom();
                  onToast("Room closed for everyone");
                }}
                className="mt-2 w-full rounded-xl border border-[#ff6b7a]/35 bg-[#ff6b7a]/10 py-2.5 font-display text-[11px] font-bold text-[#ff9aa6] hover:bg-[#ff6b7a]/20 active:scale-[0.98]"
              >
                Close Room for Everyone
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  room.leave();
                  onToast("Left the room");
                }}
                className="mt-2 w-full rounded-xl border border-white/12 bg-white/5 py-2.5 font-display text-[11px] font-bold text-[var(--dim)] hover:text-white hover:bg-white/10 active:scale-[0.98]"
              >
                Leave Room
              </button>
            )}
          </div>
        )}

        {/* MEMBERS TAB */}
        {tab === "members" && (
          <div className="scroll-slim flex h-full flex-col gap-2 overflow-y-auto px-3 py-2 pb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <GroupIcon size={14} className="text-[var(--acc0)]" />
                <h4 className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
                  Members ({room.members.length || room.online})
                </h4>
              </div>
              <span className="font-tmono text-[9px] text-[var(--dim)]">
                {room.isOwner ? "You are Owner" : room.isHost ? "You are Co-Host" : "Listener"}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {(room.members.length > 0 ? room.members : [
                { id: "host", name: hostName, role: "owner" as const, isHost: true, joinedAt: Date.now() },
                ...(!room.isHost ? [{ id: "me", name: room.nickname || "You", role: "member" as const, isHost: false, joinedAt: Date.now() }] : [])
              ]).map((m) => {
                const isMe = m.id === room.room?.myId || m.name === room.nickname;
                const isOwner = m.role === "owner";
                const isCoHost = m.role === "host";

                return (
                  <div key={m.id} className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold"
                          style={{
                            background: isOwner ? "rgba(250,204,21,0.2)" : isCoHost ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.06)",
                            color: isOwner ? "#facc15" : isCoHost ? "#38bdf8" : "var(--ink)",
                          }}
                        >
                          {isOwner ? <CrownIcon size={14} /> : isCoHost ? <ShieldIcon size={14} /> : (m.name || "U").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          {editingNick && isMe ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const clean = editingNickVal.trim();
                                if (clean && clean !== "false") {
                                  room.updateNickname(clean);
                                  setEditingNick(false);
                                }
                              }}
                              className="flex items-center gap-1 mt-0.5"
                            >
                              <input
                                value={editingNickVal}
                                onChange={(e) => setEditingNickVal(e.target.value)}
                                autoFocus
                                maxLength={24}
                                className="rounded border border-[var(--acc0)]/60 bg-black/50 px-1.5 py-0.5 text-[10px] text-white outline-none w-24"
                              />
                              <button
                                type="submit"
                                className="rounded bg-[var(--acc0)] px-1.5 py-0.5 text-[9px] font-bold text-black"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNick(false)}
                                className="rounded px-1 py-0.5 text-[9px] text-[var(--dim)]"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-display text-[11px] font-bold text-[var(--ink)]">{m.name}</span>
                              {isMe && (
                                <>
                                  <span className="shrink-0 rounded bg-white/10 px-1 font-tmono text-[7px] text-[var(--dim)]">You</span>
                                  <button
                                    onClick={() => {
                                      setEditingNickVal(m.name || room.nickname);
                                      setEditingNick(true);
                                    }}
                                    className="rounded px-1 py-0.2 font-tmono text-[7.5px] uppercase text-[var(--dim)] hover:text-[var(--acc0)]"
                                  >
                                    edit
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          <p className="text-[9px] text-[var(--dim)] capitalize">
                            {isOwner ? "Room Owner" : isCoHost ? "Co-Host" : "Member"}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-tmono text-[8px] font-bold ${
                          isOwner
                            ? "border border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]"
                            : isCoHost
                            ? "border border-sky-400/30 bg-sky-400/10 text-sky-300"
                            : "border border-white/10 bg-white/5 text-[var(--dim)]"
                        }`}
                      >
                        {isOwner ? <><CrownIcon size={9} /> Owner</> : isCoHost ? <><ShieldIcon size={9} /> Co-Host</> : "Member"}
                      </span>
                    </div>

                    {/* Host & Co-Host Delegation / Moderation Controls */}
                    {((room.isOwner && !isOwner) || (room.isHost && !isOwner && !isCoHost)) && !isMe && (
                      <div className="flex items-center justify-end gap-1.5 border-t border-white/6 pt-1.5">
                        {room.isOwner && (
                          isCoHost ? (
                            <button
                              type="button"
                              onClick={() => { room.demoteHost(m.id); onToast(`Demoted ${m.name} to member`); }}
                              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-display text-[9px] font-semibold text-[var(--dim)] hover:text-white"
                            >
                              Remove Co-Host
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { room.promoteToHost(m.id); onToast(`Promoted ${m.name} to Co-Host`); }}
                              className="rounded-md border border-sky-400/30 bg-sky-400/15 px-2 py-1 font-display text-[9px] font-semibold text-sky-300 hover:bg-sky-400/25"
                            >
                              + Make Co-Host
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => { room.kick(m.id); onToast(`Removed ${m.name}`); }}
                          className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 font-display text-[9px] font-semibold text-red-300 hover:bg-red-500/20"
                        >
                          Kick
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Leave Room Option in People Section for all members & host */}
            <div className="mt-auto pt-3">
              <button
                type="button"
                onClick={() => {
                  room.leave();
                  onToast("Left the room");
                }}
                className="w-full rounded-xl border border-white/12 bg-white/5 py-2.5 font-display text-[11px] font-bold text-[var(--dim)] hover:text-white hover:bg-white/10 active:scale-[0.98]"
              >
                Leave Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
