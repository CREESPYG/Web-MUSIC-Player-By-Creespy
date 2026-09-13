import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PlayerApi } from "../hooks/usePlayer";
import { fmtTime } from "../lib/color";
import { cn } from "../utils/cn";
import { DigitFlipper } from "./DigitFlipper";
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

const sideBtn =
  "grid h-11 w-11 place-items-center rounded-full text-[var(--dim)] transition-colors hover:bg-white/8 hover:text-white";

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
}: {
  player: PlayerApi;
  locked?: boolean;
  roomPerms?: RoomPerms;
  inRoom?: boolean;
  hideTime?: boolean;
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

  const toggleCls = (on: boolean) =>
    cn(sideBtn, on && "text-[var(--acc0)] [filter:drop-shadow(0_0_7px_var(--acc0))] hover:text-[var(--acc0)]");

  // Granular permission helpers
  const canPlayPause = !inRoom || !roomPerms || roomPerms.play_pause;
  const canNext = !inRoom || !roomPerms || roomPerms.next;
  const canPrev = !inRoom || !roomPerms || roomPerms.previous;
  const canSeek = !inRoom || !roomPerms || roomPerms.seek;
  const canShuffle = !inRoom || !roomPerms || roomPerms.shuffle;

  return (
    <div className="glass shrink-0 rounded-[var(--radius)] p-3 md:p-5 w-full max-w-[580px] mx-auto">
      {/* Room member queue-only hint */}
      {inRoom && locked && (
        <div className="mb-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-white/4 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--dim)] font-tmono uppercase tracking-[0.14em]">
            <LockIcon size={12} /> Host controls playback · Add songs to queue
          </span>
        </div>
      )}
      {/* Seek row with DigitFlipper timestamps (hidden when hideTime) */}
      {!hideTime && (
        <div className="flex items-center gap-3">
          <span className="w-12 text-right font-tmono text-[11px] tabular-nums text-[var(--dim)] font-medium">
            <DigitFlipper value={formattedTime} />
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
                setScrub(null);
              }
            }}
            onPointerCancel={() => setScrub(null)}
            className={cn(
              "group relative h-6 flex-1 touch-none select-none",
              duration > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-50"
            )}
          >
            <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-white/20" style={{ width: `${buffered * 100}%` }} />
            </div>
            <div
              className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full"
              style={{
                width: `${frac * 100}%`,
                background: "linear-gradient(90deg, var(--acc0), var(--acc1))",
                boxShadow: "0 0 12px var(--acc0)",
              }}
            />
            <div
              className={cn(
                "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--acc0)] bg-white shadow-[0_0_10px_var(--acc0)] transition-opacity",
                scrub !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              style={{ left: `${frac * 100}%` }}
            />
            {scrub !== null && (
              <div
                className="glass-soft pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md px-2 py-1 font-tmono text-[10px] tabular-nums text-white"
                style={{ left: `${frac * 100}%` }}
              >
                {fmtTime(scrub)}
              </div>
            )}
          </div>
          <span className="w-12 font-tmono text-[11px] tabular-nums text-[var(--dim)] font-medium">
            <DigitFlipper value={formattedDuration} />
          </span>
        </div>
      )}

      {/* Transport controls row */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-y-4">
        {/* Left: Volume & Rate */}
        <div className="order-2 flex items-center gap-1.5 sm:order-1">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={player.toggleMute}
            className={sideBtn}
            aria-label={player.muted ? "Unmute" : "Mute"}
          >
            {player.muted || player.volume === 0 ? <MuteIcon size={20} /> : <VolumeIcon size={20} />}
          </motion.button>
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
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={player.cycleRate}
            title="Playback speed"
            className="glass-soft ml-1 rounded-lg px-2 py-1 font-tmono text-[11px] text-[var(--dim)] transition-colors hover:text-[var(--acc0)]"
          >
            {player.rate}×
          </motion.button>
        </div>

        {/* Center: Main Playback Controls */}
        <div
          className={cn(
            "order-1 flex w-full items-center justify-center gap-2 sm:order-2 sm:w-auto",
            !ready && "pointer-events-none opacity-50"
          )}
        >
          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            onClick={player.cycleShuffle}
            disabled={!canShuffle}
            className={cn(toggleCls(player.shuffleMode !== "off"), "relative", !canShuffle && "opacity-30 cursor-not-allowed pointer-events-none")}
            title={!canShuffle ? "Host controls shuffle" : `Shuffle: ${player.shuffleMode}`}
            aria-label={`Shuffle mode ${player.shuffleMode}`}
          >
            <ShuffleIcon size={19} />
            {player.shuffleMode === "magic" && (
              <span
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg0)]"
                style={{ background: "var(--acc2)", boxShadow: "0 0 8px var(--acc2)" }}
              />
            )}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            onClick={player.prev}
            disabled={!canPrev}
            className={cn(sideBtn, !canPrev && "opacity-30 cursor-not-allowed")}
            title={!canPrev ? "Host controls previous" : "Previous"}
            aria-label="Previous"
          >
            <PrevIcon size={22} />
          </motion.button>

          {/* Large Glowing Play / Pause */}
          <span className="relative mx-1 grid h-[74px] w-[74px] place-items-center">
            <span
              className={`absolute inset-0 rounded-full blur-2xl ${player.playing ? "glow-breathe" : "opacity-30"}`}
              style={{ background: "var(--acc0)" }}
            />
            <motion.button
              whileHover={canPlayPause ? { scale: 1.06 } : {}}
              whileTap={canPlayPause ? { scale: 0.9 } : {}}
              onClick={canPlayPause ? player.toggle : undefined}
              aria-label={player.playing ? "Pause" : "Play"}
              title={!canPlayPause ? "Host controls playback" : undefined}
              className={cn(
                "relative grid h-full w-full place-items-center rounded-full border border-white/25 text-black shadow-lg",
                !canPlayPause && "cursor-not-allowed opacity-50"
              )}
              style={{
                background: "linear-gradient(145deg, var(--acc0), var(--acc1))",
                boxShadow: "0 12px 34px -8px var(--acc0), inset 0 1px 0 rgba(255,255,255,0.5)",
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={player.playing ? "pause" : "play"}
                  initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
                  transition={{ duration: 0.18 }}
                  className="grid place-items-center"
                >
                  {player.playing ? <PauseIcon size={30} /> : <PlayIcon size={30} className="ml-1" />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </span>

          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            onClick={player.next}
            disabled={!canNext}
            className={cn(sideBtn, !canNext && "opacity-30 cursor-not-allowed")}
            title={!canNext ? "Host controls next" : "Next"}
            aria-label="Next"
          >
            <NextIcon size={22} />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            onClick={player.cycleRepeat}
            className={cn(toggleCls(player.repeat !== "off"), "relative")}
            aria-label="Repeat"
          >
            {player.repeat === "one" ? <RepeatOneIcon size={19} /> : <RepeatIcon size={19} />}
            {player.repeat === "off" && (
              <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current opacity-60" />
            )}
          </motion.button>
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
