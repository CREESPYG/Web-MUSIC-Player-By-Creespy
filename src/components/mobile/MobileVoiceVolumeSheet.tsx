import React from "react";
import { motion, AnimatePresence } from "motion/react";
import type { VoiceParticipant, MemberRole } from "../../lib/room";
import {
  CloseIcon,
  CrownIcon,
  ShieldIcon,
  MicIcon,
  MicOffIcon,
  DeafIcon,
  PhoneOffIcon,
  Volume2Icon,
  VolumeXIcon,
} from "../UiIcons";

interface MobileVoiceVolumeSheetProps {
  participant: VoiceParticipant | null;
  onClose: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isLocallyMuted: boolean;
  onToggleLocalMute: () => void;
  myUserId: string;
  myRole: MemberRole;
  isOwner: boolean;
  isSpeaking: boolean;
  onHostMute?: (muted: boolean) => void;
  onToggleCanSpeak?: (allowed: boolean) => void;
  onToggleCanHear?: (allowed: boolean) => void;
  onKickVoice?: () => void;
  onPromoteHost?: () => void;
  onDemoteHost?: () => void;
}

export const MobileVoiceVolumeSheet: React.FC<MobileVoiceVolumeSheetProps> = ({
  participant,
  onClose,
  volume,
  onVolumeChange,
  isLocallyMuted,
  onToggleLocalMute,
  myUserId,
  myRole,
  isOwner,
  isSpeaking,
  onHostMute,
  onToggleCanSpeak,
  onToggleCanHear,
  onKickVoice,
  onPromoteHost,
  onDemoteHost,
}) => {
  if (!participant) return null;

  const isMe = participant.userId === myUserId;
  const targetIsOwner = participant.role === "owner";
  const canModerate = (isOwner || myRole === "host") && !isMe && !targetIsOwner;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex flex-col justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Sheet */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 350, damping: 32 }}
          className="relative z-10 w-full rounded-t-3xl border-t border-white/12 bg-[linear-gradient(180deg,#0a101d_0%,#04070e_100%)] p-5 pb-8 shadow-2xl backdrop-blur-2xl"
          style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
        >
          {/* Top Handle */}
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />

          {/* User Info Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/8">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-base font-bold text-white shadow-lg transition-all ${
                  isSpeaking
                    ? "bg-[var(--acc0)] text-black ring-4 ring-[var(--acc0)]/40 shadow-[0_0_16px_var(--acc0)]"
                    : "bg-white/10"
                }`}
              >
                {participant.nickname.slice(0, 2).toUpperCase()}
                {isSpeaking && (
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-black">
                    <span className="h-2 w-2 rounded-full bg-black animate-ping" />
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="truncate font-display text-base font-bold text-[var(--ink)]">
                    {participant.nickname}
                  </h3>
                  {isMe && (
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-tmono text-[9px] font-semibold text-[var(--dim)]">
                      You
                    </span>
                  )}
                  {participant.role === "owner" && (
                    <span className="flex items-center gap-1 rounded-md bg-[var(--acc0)]/20 px-1.5 py-0.5 font-tmono text-[9px] font-bold text-[var(--acc0)]">
                      <CrownIcon size={10} /> Owner
                    </span>
                  )}
                  {participant.role === "host" && (
                    <span className="flex items-center gap-1 rounded-md bg-cyan-400/20 px-1.5 py-0.5 font-tmono text-[9px] font-bold text-cyan-300">
                      <ShieldIcon size={10} /> Host
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--dim)]">
                  {participant.hostMuted ? (
                    <span className="text-[#f43f5e] flex items-center gap-1">
                      <MicOffIcon size={12} /> Muted by Host
                    </span>
                  ) : participant.selfMuted ? (
                    <span className="text-[var(--dim)] flex items-center gap-1">
                      <MicOffIcon size={12} /> Mic Muted
                    </span>
                  ) : !participant.canSpeak ? (
                    <span className="text-[#f43f5e] flex items-center gap-1">
                      <MicOffIcon size={12} /> Talk Disabled
                    </span>
                  ) : isSpeaking ? (
                    <span className="text-[var(--acc0)] font-semibold flex items-center gap-1">
                      <MicIcon size={12} /> Speaking...
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <MicIcon size={12} /> Connected
                    </span>
                  )}

                  {!participant.canHear && (
                    <span className="text-amber-400 flex items-center gap-1">
                      • <DeafIcon size={12} /> Hearing Muted
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-[var(--dim)] active:bg-white/15"
              aria-label="Close"
            >
              <CloseIcon size={20} />
            </button>
          </div>

          {/* Individual Volume Control (Only for other participants) */}
          {!isMe && (
            <div className="mt-5 space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  {isLocallyMuted || volume === 0 ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
                  User Volume (Local)
                </span>
                <span className="font-tmono text-sm font-bold text-[var(--acc0)]">
                  {isLocallyMuted ? "0% (Muted)" : `${volume}%`}
                </span>
              </div>

              {/* Large Touch Slider */}
              <div className="relative py-2">
                <input
                  type="range"
                  min={0}
                  max={150}
                  step={1}
                  value={isLocallyMuted ? 0 : volume}
                  disabled={isLocallyMuted}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="h-3 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--acc0)] disabled:opacity-40"
                  aria-label={`Volume for ${participant.nickname}`}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={onToggleLocalMute}
                  className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl font-display text-xs font-bold transition-all ${
                    isLocallyMuted
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "bg-white/8 text-[var(--ink)] active:bg-white/15 border border-white/10"
                  }`}
                >
                  {isLocallyMuted ? <Volume2Icon size={15} /> : <VolumeXIcon size={15} />}
                  {isLocallyMuted ? "Unmute on My Device" : "Mute on My Device"}
                </button>
              </div>
            </div>
          )}

          {/* Host / Owner Moderation Panel */}
          {canModerate && (
            <div className="mt-4 space-y-2.5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <h4 className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">
                Moderation Actions
              </h4>

              <div className="grid grid-cols-2 gap-2">
                {/* Host Mute */}
                <button
                  type="button"
                  onClick={() => onHostMute?.(!participant.hostMuted)}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold ${
                    participant.hostMuted
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  }`}
                >
                  <MicOffIcon size={14} />
                  {participant.hostMuted ? "Unmute Mic" : "Mute Mic"}
                </button>

                {/* Toggle Can Speak */}
                <button
                  type="button"
                  onClick={() => onToggleCanSpeak?.(!participant.canSpeak)}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 text-xs font-semibold text-white active:bg-white/10"
                >
                  <MicIcon size={14} />
                  {participant.canSpeak ? "Revoke Talk" : "Allow Talk"}
                </button>

                {/* Toggle Can Hear */}
                <button
                  type="button"
                  onClick={() => onToggleCanHear?.(!participant.canHear)}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 text-xs font-semibold text-white active:bg-white/10"
                >
                  <DeafIcon size={14} />
                  {participant.canHear ? "Mute Hearing" : "Allow Hearing"}
                </button>

                {/* Kick from Voice */}
                <button
                  type="button"
                  onClick={onKickVoice}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/15 text-xs font-bold text-rose-300 active:bg-rose-500/25"
                >
                  <PhoneOffIcon size={14} />
                  Disconnect Voice
                </button>
              </div>

              {/* Owner Role Actions (Only Owner can promote/demote) */}
              {isOwner && (
                <div className="pt-2 border-t border-white/8">
                  {participant.role === "member" ? (
                    <button
                      type="button"
                      onClick={onPromoteHost}
                      className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 text-xs font-bold text-cyan-300 active:bg-cyan-500/25"
                    >
                      <ShieldIcon size={14} />
                      Promote to Co-Host
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onDemoteHost}
                      className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 text-xs font-semibold text-[var(--dim)] active:bg-white/10"
                    >
                      Demote to Member
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-white/10 font-display text-xs font-bold uppercase tracking-wider text-white active:bg-white/20"
          >
            Done
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
