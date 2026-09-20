import { useRef, useState } from "react";
import type { PlayerApi } from "../hooks/usePlayer";
export type { PlayerApi };
import { fmtTime } from "../lib/color";
import { cn } from "../utils/cn";
import {
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./Icons";
import { LockIcon } from "./UiIcons";

interface RoomPerms {
  play_pause: boolean;
  next: boolean;
  previous: boolean;
  seek: boolean;
  shuffle: boolean;
}

export function Controls({
  player,
  locked = false,
  roomPerms,
  inRoom = false,
  hideTime = false,
  onSeek,
}: {
  player: PlayerApi;
  locked?: boolean;
  roomPerms?: RoomPerms;
  inRoom?: boolean;
  hideTime?: boolean;
  onSeek?: (pos: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);

  const { duration, time, buffered, ready } = player;
  const shown = scrub ?? time;
  const frac = duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0;

  const posFromEvent = (e: React.PointerEvent) => {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
  };

  const formattedTime = fmtTime(shown);
  const formattedDuration = fmtTime(duration);

  // Granular permission helpers
  const canPlayPause = !inRoom || !roomPerms || roomPerms.play_pause;
  const canNext = !inRoom || !roomPerms || roomPerms.next;
  const canPrev = !inRoom || !roomPerms || roomPerms.previous;
  const canSeek = !inRoom || !roomPerms || roomPerms.seek;
  const canShuffle = !inRoom || !roomPerms || roomPerms.shuffle;

  return (
    <div className="shrink-0 rounded-[28px] border border-white/8 bg-[var(--bg1,#161e28)] p-4 md:p-5 w-full max-w-[580px] mx-auto select-none shadow-none">
      {/* Room member queue-only hint */}
      {inRoom && locked && (
        <div className="mb-2.5 flex items-center justify-center gap-1.5 rounded-full bg-white/5 border border-white/8 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--dim)] font-tmono uppercase tracking-[0.14em]">
            <LockIcon size={12} /> Host controls playback · Add songs to queue
          </span>
        </div>
      )}
      {/* Material 3 Expressive Seek Bar with Monospace Timestamps */}
      {!hideTime && (
        <div className="flex items-center gap-3">
          <span className="w-12 text-right font-tmono text-[11px] tabular-nums text-[var(--dim)] font-semibold">
            {formattedTime}
          </span>
          <div
            ref={barRef}
            onPointerDown={(e) => {
              if (!duration || !canSeek) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setScrub(posFromEvent(e));
            }}
            onPointerMove={(e) => {
              if (scrub !== null) setScrub(posFromEvent(e));
            }}
            onPointerUp={() => {
              if (scrub !== null) {
                player.seek(scrub);
                onSeek?.(scrub);
                setScrub(null);
              }
            }}
            onPointerCancel={() => setScrub(null)}
            className={cn(
              "group relative h-7 flex-1 touch-none select-none flex items-center cursor-pointer",
              duration > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-50"
            )}
          >
            {/* Background pill track */}
            <div className="relative w-full h-2 rounded-full overflow-hidden bg-white/10">
              {/* Buffer track */}
              <div className="h-full rounded-full bg-white/15" style={{ width: `${buffered * 100}%` }} />
              {/* Active played track */}
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-75"
                style={{
                  width: `${frac * 100}%`,
                  background: "var(--acc0)",
                }}
              />
            </div>
            {/* Expressive M3 thumb knob */}
            <div
              className={cn(
                "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--acc0)] shadow-md transition-transform duration-150",
                scrub !== null ? "scale-125 ring-4 ring-[var(--acc0)]/25" : "scale-100 group-hover:scale-115"
              )}
              style={{ left: `${frac * 100}%` }}
            />
            {scrub !== null && (
              <div
                className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-full bg-[#1e293b] border border-white/10 px-2.5 py-0.5 font-tmono text-[10px] tabular-nums text-white shadow-lg"
                style={{ left: `${frac * 100}%` }}
              >
                {fmtTime(scrub)}
              </div>
            )}
          </div>
          <span className="w-12 font-tmono text-[11px] tabular-nums text-[var(--dim)] font-semibold">
            {formattedDuration}
          </span>
        </div>
      )}

      {/* Transport controls row */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-y-4">
        {/* Left: Volume & Rate */}
        <div className="order-2 flex items-center gap-1 sm:order-1">
          <md-icon-button
            aria-label={player.muted ? "Unmute" : "Mute"}
            onClick={player.toggleMute}
          >
            {player.muted || player.volume === 0 ? <MuteIcon size={18} /> : <VolumeIcon size={18} />}
          </md-icon-button>
          <input
            type="range"
            min={0}
            max={100}
            value={player.muted ? 0 : player.volume}
            onChange={(e) => player.setVol(Number(e.target.value))}
            className="vol hidden w-20 sm:block"
            style={{ "--fill": `${player.muted ? 0 : player.volume}%` } as React.CSSProperties}
            aria-label="Volume"
          />
          <md-filter-chip
            label={`${player.rate}×`}
            onClick={player.cycleRate}
            title="Playback speed"
            style={{ "--md-filter-chip-container-height": "28px" } as React.CSSProperties}
          />
        </div>

        {/* Center: Main Playback Controls with Material Web */}
        <div
          className={cn(
            "order-1 flex w-full items-center justify-center gap-1 sm:order-2 sm:w-auto",
            !ready && "pointer-events-none opacity-50"
          )}
        >
          <md-icon-button
            toggle
            selected={player.shuffleMode !== "off"}
            disabled={!canShuffle}
            onClick={player.cycleShuffle}
            title={!canShuffle ? "Host controls shuffle" : `Shuffle: ${player.shuffleMode}`}
            aria-label={`Shuffle mode ${player.shuffleMode}`}
          >
            <ShuffleIcon size={19} />
          </md-icon-button>

          <md-icon-button
            disabled={!canPrev}
            onClick={player.prev}
            title={!canPrev ? "Host controls previous" : "Previous"}
            aria-label="Previous"
          >
            <PrevIcon size={22} />
          </md-icon-button>

          {/* Official Google Material Web FAB */}
          <div className="relative mx-1.5 flex items-center justify-center">
            <md-fab
              size="medium"
              variant="primary"
              aria-label={player.playing ? "Pause" : "Play"}
              disabled={!canPlayPause}
              onClick={canPlayPause ? player.toggle : undefined}
              title={!canPlayPause ? "Host controls playback" : undefined}
            >
              <span slot="icon" className="grid place-items-center">
                {player.playing ? <PauseIcon size={28} /> : <PlayIcon size={28} className="ml-0.5" />}
              </span>
            </md-fab>
          </div>

          <md-icon-button
            disabled={!canNext}
            onClick={player.next}
            title={!canNext ? "Host controls next" : "Next"}
            aria-label="Next"
          >
            <NextIcon size={22} />
          </md-icon-button>

          <md-icon-button
            toggle
            selected={player.repeat !== "off"}
            onClick={player.cycleRepeat}
            aria-label="Repeat"
            title={`Repeat: ${player.repeat}`}
          >
            {player.repeat === "one" ? <RepeatOneIcon size={19} /> : <RepeatIcon size={19} />}
          </md-icon-button>
        </div>

        {/* Right: Mode status label */}
        <div className="order-3 hidden flex-col items-end gap-1 sm:flex min-w-[90px]">
          <span className="font-tmono text-[10px] uppercase tracking-[0.18em] text-[var(--dim)]">
            {player.repeat === "off" ? "repeat off" : player.repeat === "one" ? "repeat one" : "repeat all"}
          </span>
          <span
            className="font-tmono text-[9.5px] uppercase tracking-[0.18em]"
            style={{ color: player.shuffleMode === "magic" ? "var(--acc2)" : "var(--dim)" }}
          >
            {player.shuffleMode === "magic" ? "✦ magic shuffle" : player.shuffleMode === "random" ? "shuffle" : "in order"}
          </span>
        </div>
      </div>
    </div>
  );
}
