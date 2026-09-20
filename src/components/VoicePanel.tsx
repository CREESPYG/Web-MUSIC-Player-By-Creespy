import React, { useState } from "react";
import type { RoomApi } from "../hooks/useRoom";
import type { VoiceParticipant } from "../lib/room";
import {
  CrownIcon,
  ShieldIcon,
  MicIcon,
  MicOffIcon,
  DeafIcon,
  PhoneOffIcon,
  Volume2Icon,
  VolumeXIcon,
  Switch,
  SettingsIcon,
} from "./UiIcons";
import { MobileVoiceVolumeSheet } from "./mobile/MobileVoiceVolumeSheet";

interface VoicePanelProps {
  room: RoomApi;
  onToast: (msg: string) => void;
  className?: string;
  isMobile?: boolean;
}

export const VoicePanel: React.FC<VoicePanelProps> = ({
  room,
  onToast,
  className = "",
  isMobile = false,
}) => {
  const { voice } = room;
  const [selectedUser, setSelectedUser] = useState<VoiceParticipant | null>(null);
  const [openVolumePopoverUserId, setOpenVolumePopoverUserId] = useState<string | null>(null);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  const isOwner = room.isOwner;
  const isHost = room.isHost;

  // Active voice participants
  const activeVoiceUsers = voice.voiceUsers;
  const voiceUserIds = new Set(activeVoiceUsers.map((u) => u.userId));

  // Other room members who haven't joined voice channel yet
  const otherRoomMembers = (room.members || []).filter(
    (m) => !voiceUserIds.has(m.id)
  );

  const handleToggleVoice = () => {
    if (voice.isInVoice) {
      voice.leaveVoice();
      onToast("Left voice room");
    } else {
      voice.joinVoice();
    }
  };

  return (
    <div className={`scroll-slim flex flex-col h-full w-full select-none overflow-y-auto ${isMobile ? "px-3 py-2 pb-24" : "p-1"} ${className}`}>
      {/* 1. Voice Header & Global Controls */}
      <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] p-3.5 mb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all ${
              voice.isInVoice
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                : "bg-white/8 text-[var(--dim)] border border-white/10"
            }`}
          >
            <MicIcon size={18} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                Room Voice
              </h3>
              {room.room?.voiceEnabled ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-tmono text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {activeVoiceUsers.length} in voice
                </span>
              ) : (
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-tmono text-[9px] font-bold text-rose-400 border border-rose-500/20">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-[10px] text-[var(--dim)] mt-0.5">
              Isolated WebRTC audio stream · zero music interference
            </p>
          </div>
        </div>

        {/* Device Settings Toggle or Voice Enabled Switch for Owner */}
        <div className="flex items-center gap-2">
          {voice.audioInputs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeviceSettings(!showDeviceSettings)}
              className={`grid h-8 w-8 place-items-center rounded-lg border text-[var(--dim)] transition-colors ${
                showDeviceSettings
                  ? "border-[var(--acc0)] text-[var(--acc0)] bg-[var(--acc0)]/10"
                  : "border-white/10 hover:text-white hover:bg-white/5"
              }`}
              title="Audio Devices"
              aria-label="Audio Devices"
            >
              <SettingsIcon size={14} />
            </button>
          )}

          {isHost && (
            <div className="flex items-center gap-1.5" title="Toggle Room Voice globally">
              <span className="font-tmono text-[8.5px] uppercase tracking-wider text-[var(--dim)] hidden sm:inline">
                Voice
              </span>
              <Switch
                on={room.room?.voiceEnabled ?? true}
                onChange={(on) => {
                  room.toggleVoiceEnabled(on);
                  onToast(on ? "Voice enabled for room" : "Voice disabled for room");
                }}
                label="Voice enabled switch"
              />
            </div>
          )}
        </div>
      </div>

      {/* Explicit Voice Lifecycle Status Badges */}
      <div className="mb-3">
        {!room.room?.voiceEnabled ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
            <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
            <span className="font-semibold">Voice Disabled by Host</span>
          </div>
        ) : voice.status === "mic_blocked" ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold">Microphone Permission Required</span>
          </div>
        ) : voice.status === "reconnecting" ? (
          <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-300">
            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400 animate-pulse" />
            <span className="font-semibold">Voice Reconnecting…</span>
            <span className="text-[10px] text-sky-200/70 ml-auto">Room Active</span>
          </div>
        ) : voice.status === "connected" ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold">Voice Connected</span>
            </div>
            <span className="font-tmono text-[10px] text-emerald-400/80">WebRTC Mesh Active</span>
          </div>
        ) : typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia ? (
          <div className="flex items-center gap-2 rounded-xl border border-neutral-500/30 bg-neutral-500/10 px-3 py-2 text-[11px] text-neutral-400">
            <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
            <span className="font-semibold">Voice Unavailable</span>
          </div>
        ) : null}
      </div>

      {/* Device Selection Card (Collapsible) */}
      {showDeviceSettings && (
        <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
          <p className="font-tmono text-[9px] uppercase tracking-wider text-[var(--dim)]">Audio Hardware Routing</p>
          {voice.audioInputs.length > 0 && (
            <div>
              <label className="block text-[10px] text-[var(--dim)] mb-1">Microphone Input</label>
              <select
                value={voice.selectedInput}
                onChange={(e) => voice.setAudioInputDevice(e.target.value)}
                className="w-full rounded-lg border border-white/12 bg-black/60 px-2 py-1.5 text-xs text-white outline-none focus:border-[var(--acc0)]"
              >
                {voice.audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {voice.audioOutputs.length > 0 && (
            <div>
              <label className="block text-[10px] text-[var(--dim)] mb-1">Speaker Output</label>
              <select
                value={voice.selectedOutput}
                onChange={(e) => voice.setAudioOutputDevice(e.target.value)}
                className="w-full rounded-lg border border-white/12 bg-black/60 px-2 py-1.5 text-xs text-white outline-none focus:border-[var(--acc0)]"
              >
                {voice.audioOutputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* 2. Main Action Strip (Join, Leave, Mute) */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 mb-4">
        {!voice.isInVoice ? (
          <md-filled-button
            onClick={handleToggleVoice}
            disabled={!room.room?.voiceEnabled || voice.status === "requesting_mic"}
            style={{ width: "100%", "--md-filled-button-container-height": "48px" } as any}
          >
            <span slot="icon"><MicIcon size={18} /></span>
            {voice.status === "requesting_mic" ? "Requesting Microphone…" : "Join Voice Channel"}
          </md-filled-button>
        ) : (
          <div className="flex items-center gap-2">
            {/* Master Mic Mute/Unmute */}
            <md-filled-tonal-button
              onClick={voice.toggleSelfMute}
              disabled={voice.hostMuted || !voice.canSpeak}
              style={{ flex: "1", "--md-filled-tonal-button-container-height": "48px" } as any}
            >
              <span slot="icon">
                {voice.selfMuted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
              </span>
              {voice.hostMuted
                ? "Muted by Host"
                : !voice.canSpeak
                ? "Talk Disabled"
                : voice.selfMuted
                ? "Unmute Mic"
                : "Mic Active"}
            </md-filled-tonal-button>

            {/* Leave Voice */}
            <md-outlined-button
              onClick={handleToggleVoice}
              style={{ "--md-outlined-button-container-height": "48px" } as any}
            >
              <span slot="icon"><PhoneOffIcon size={16} /></span>
              Leave
            </md-outlined-button>
          </div>
        )}
      </div>

      {/* 3. Connected Voice Participants Roster */}
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between border-b border-white/6 pb-2.5 mb-3">
          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
            Active in Voice ({activeVoiceUsers.length})
          </span>
          <span className="text-[10px] text-[var(--dim)]">
            Tap user for volume & controls
          </span>
        </div>

        <div className="space-y-2 pr-0.5">
          {activeVoiceUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-[var(--dim)] space-y-1.5 rounded-xl border border-dashed border-white/8 bg-white/[0.01]">
              <MicOffIcon size={24} className="opacity-30 mx-auto text-[var(--acc0)]" />
              <p className="font-semibold text-white">Voice channel is idle</p>
              <p className="text-[10px] max-w-xs opacity-70">
                Tap "Join Voice Channel" above to start talking!
              </p>
            </div>
          ) : (
            activeVoiceUsers.map((p) => {
              const isMe = p.userId === room.me;
              const isSpeaking = !!voice.speakingMap[p.userId];
              const userVol = voice.getUserVolume(p.userId);
              const isMuted = voice.isUserLocallyMuted(p.userId);
              const popoverOpen = openVolumePopoverUserId === p.userId;

              return (
                <div
                  key={p.userId}
                  onClick={() => {
                    if (isMobile) {
                      setSelectedUser(p);
                    } else {
                      setOpenVolumePopoverUserId(popoverOpen ? null : p.userId);
                    }
                  }}
                  className={`group relative flex items-center justify-between rounded-xl border p-2.5 transition-all cursor-pointer ${
                    isSpeaking
                      ? "border-[var(--acc0)] bg-[var(--acc0)]/10 shadow-[0_0_12px_rgba(0,255,225,0.15)]"
                      : "border-white/6 bg-white/[0.03] hover:border-white/15"
                  }`}
                >
                  {/* Left: Avatar + Name + Badges */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-xs font-bold text-white transition-all ${
                        isSpeaking
                          ? "bg-[var(--acc0)] text-black ring-2 ring-[var(--acc0)]"
                          : "bg-white/10"
                      }`}
                    >
                      {p.nickname.slice(0, 2).toUpperCase()}
                      {isSpeaking && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-black animate-pulse" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-display text-xs font-bold text-[var(--ink)]">
                          {p.nickname}
                        </span>
                        {isMe && (
                          <span className="rounded bg-white/10 px-1 py-0.2 font-tmono text-[8.5px] text-[var(--dim)]">
                            You
                          </span>
                        )}
                        {p.role === "owner" && (
                          <span className="flex items-center gap-0.5 rounded bg-[var(--acc0)]/20 px-1 py-0.2 font-tmono text-[8.5px] font-bold text-[var(--acc0)]">
                            <CrownIcon size={9} /> Owner
                          </span>
                        )}
                        {p.role === "host" && (
                          <span className="flex items-center gap-0.5 rounded bg-cyan-400/20 px-1 py-0.2 font-tmono text-[8.5px] font-bold text-cyan-300">
                            <ShieldIcon size={9} /> Host
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 text-[9.5px] text-[var(--dim)]">
                        {p.hostMuted ? (
                          <span className="text-[#f43f5e] flex items-center gap-0.5">
                            <MicOffIcon size={10} /> Host-Muted
                          </span>
                        ) : p.selfMuted ? (
                          <span className="text-[var(--dim)] flex items-center gap-0.5">
                            <MicOffIcon size={10} /> Muted
                          </span>
                        ) : !p.canSpeak ? (
                          <span className="text-[#f43f5e] flex items-center gap-0.5">
                            <MicOffIcon size={10} /> Talk Disabled
                          </span>
                        ) : isSpeaking ? (
                          <span className="text-[var(--acc0)] font-semibold">Speaking…</span>
                        ) : (
                          <span className="text-emerald-400">Connected</span>
                        )}

                        {!p.canHear && (
                          <span className="text-amber-400 flex items-center gap-0.5">
                            • <DeafIcon size={10} /> Hearing Off
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Volume pill & popover button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!isMe && (
                      <div className="flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 border border-white/8">
                        {isMuted || userVol === 0 ? (
                          <VolumeXIcon size={12} className="text-rose-400" />
                        ) : (
                          <Volume2Icon size={12} className="text-[var(--acc0)]" />
                        )}
                        <span className="font-tmono text-[10px] font-bold text-white">
                          {isMuted ? "0%" : `${userVol}%`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Desktop Inline Popover for Volume & Moderation */}
                  {!isMobile && popoverOpen && !isMe && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-2 top-full mt-1 z-30 w-64 rounded-xl border border-white/15 bg-[rgba(10,16,28,0.98)] p-3 shadow-2xl backdrop-blur-xl"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-white/8 mb-2">
                        <span className="font-display text-[11px] font-bold text-white">
                          {p.nickname}'s Audio
                        </span>
                        <button
                          type="button"
                          onClick={() => setOpenVolumePopoverUserId(null)}
                          className="text-[var(--dim)] hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Slider */}
                      <div className="space-y-1.5 mb-3">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-[var(--dim)]">Local Volume</span>
                          <span className="font-tmono font-bold text-[var(--acc0)]">
                            {isMuted ? "Muted" : `${userVol}%`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={150}
                          step={1}
                          value={isMuted ? 0 : userVol}
                          disabled={isMuted}
                          onChange={(e) => voice.setUserVolume(p.userId, Number(e.target.value))}
                          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--acc0)]"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => voice.toggleLocalMuteUser(p.userId)}
                        className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isMuted
                            ? "border-rose-500/30 bg-rose-500/15 text-rose-300"
                            : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                        }`}
                      >
                        {isMuted ? <Volume2Icon size={13} /> : <VolumeXIcon size={13} />}
                        {isMuted ? "Unmute on My Device" : "Mute on My Device"}
                      </button>

                      {/* Moderation section */}
                      {(isOwner || isHost) && p.role !== "owner" && (
                        <div className="mt-2.5 pt-2 border-t border-white/8 space-y-1.5">
                          <p className="font-tmono text-[8px] uppercase tracking-wider text-[var(--dim)]">Host Actions</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => voice.setMemberHostMuted(p.userId, !p.hostMuted)}
                              className="rounded bg-white/5 px-2 py-1 text-[10px] font-medium text-white hover:bg-white/10 border border-white/8"
                            >
                              {p.hostMuted ? "Unmute Mic" : "Host Mute"}
                            </button>
                            <button
                              type="button"
                              onClick={() => voice.setMemberCanSpeak(p.userId, !p.canSpeak)}
                              className="rounded bg-white/5 px-2 py-1 text-[10px] font-medium text-white hover:bg-white/10 border border-white/8"
                            >
                              {p.canSpeak ? "Revoke Talk" : "Allow Talk"}
                            </button>
                            <button
                              type="button"
                              onClick={() => voice.setMemberCanHear(p.userId, !p.canHear)}
                              className="rounded bg-white/5 px-2 py-1 text-[10px] font-medium text-white hover:bg-white/10 border border-white/8"
                            >
                              {p.canHear ? "Mute Hearing" : "Allow Hearing"}
                            </button>
                            <button
                              type="button"
                              onClick={() => voice.kickFromVoice(p.userId)}
                              className="rounded bg-rose-500/15 px-2 py-1 text-[10px] font-medium text-rose-300 hover:bg-rose-500/25 border border-rose-500/30"
                            >
                              Disconnect
                            </button>
                          </div>

                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                if (p.role === "member") room.promoteToHost(p.userId);
                                else room.demoteHost(p.userId);
                              }}
                              className="w-full rounded bg-cyan-500/15 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30"
                            >
                              {p.role === "member" ? "Promote to Co-Host" : "Demote to Member"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Other Room Listeners (In Room but Not in Voice) */}
          {otherRoomMembers.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/8">
              <div className="flex items-center justify-between pb-2 mb-2">
                <span className="font-display text-[10.5px] font-bold uppercase tracking-wider text-[var(--dim)]">
                  Room Listeners ({otherRoomMembers.length})
                </span>
                <span className="font-tmono text-[9px] text-[var(--dim)]/70">
                  In room · not in voice
                </span>
              </div>
              <div className="space-y-2">
                {otherRoomMembers.map((m) => {
                  const isMe = m.id === room.me;
                  const isOwner = m.role === "owner";
                  const isHost = m.role === "host";

                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        if (isMobile) {
                          setSelectedUser({
                            userId: m.id,
                            nickname: m.name || "Anonymous",
                            role: m.role,
                            selfMuted: false,
                            hostMuted: m.hostMuted ?? false,
                            canSpeak: m.canSpeak ?? true,
                            canHear: m.canHear ?? true,
                            speaking: false,
                            connectedAt: m.joinedAt ?? Date.now(),
                          });
                        }
                      }}
                      className="group flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.02] p-2.5 transition-all hover:border-white/15"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold text-white"
                          style={{
                            background: isOwner ? "rgba(250,204,21,0.18)" : isHost ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.06)",
                            color: isOwner ? "#facc15" : isHost ? "#38bdf8" : "var(--ink)",
                          }}
                        >
                          {isOwner ? <CrownIcon size={14} /> : isHost ? <ShieldIcon size={14} /> : (m.name || "U").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-display text-xs font-bold text-[var(--ink)]">{m.name}</span>
                            {isMe && <span className="rounded bg-white/10 px-1 font-tmono text-[7px] text-[var(--dim)]">You</span>}
                            {isOwner && (
                              <span className="flex items-center gap-0.5 rounded bg-[var(--acc0)]/20 px-1 font-tmono text-[8px] font-bold text-[var(--acc0)]">
                                <CrownIcon size={8} /> Owner
                              </span>
                            )}
                            {isHost && (
                              <span className="flex items-center gap-0.5 rounded bg-cyan-400/20 px-1 font-tmono text-[8px] font-bold text-cyan-300">
                                <ShieldIcon size={8} /> Host
                              </span>
                            )}
                          </div>
                          <p className="text-[9.5px] text-[var(--dim)] mt-0.5">Listening to music · Not in voice</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-tmono text-[8px] text-[var(--dim)]">
                          Listening
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Mobile Bottom Sheet for Selected User Volume & Moderation */}
      {isMobile && selectedUser && (
        <MobileVoiceVolumeSheet
          participant={selectedUser}
          onClose={() => setSelectedUser(null)}
          volume={voice.getUserVolume(selectedUser.userId)}
          onVolumeChange={(vol) => voice.setUserVolume(selectedUser.userId, vol)}
          isLocallyMuted={voice.isUserLocallyMuted(selectedUser.userId)}
          onToggleLocalMute={() => voice.toggleLocalMuteUser(selectedUser.userId)}
          myUserId={room.me}
          myRole={room.myRole}
          isOwner={room.isOwner}
          isSpeaking={!!voice.speakingMap[selectedUser.userId]}
          onHostMute={(muted) => voice.setMemberHostMuted(selectedUser.userId, muted)}
          onToggleCanSpeak={(allowed) => voice.setMemberCanSpeak(selectedUser.userId, allowed)}
          onToggleCanHear={(allowed) => voice.setMemberCanHear(selectedUser.userId, allowed)}
          onKickVoice={() => voice.kickFromVoice(selectedUser.userId)}
          onPromoteHost={() => room.promoteToHost(selectedUser.userId)}
          onDemoteHost={() => room.demoteHost(selectedUser.userId)}
        />
      )}
    </div>
  );
};
