import { useState } from "react";
import { DiscStage } from "../../DiscStage";
import type { Track } from "../../../lib/trackModel";
import type { Theme } from "../../../themes";
import type { PlayerApi } from "../../Controls";
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  ShuffleIcon,
  RepeatIcon,
  VolumeIcon,
  MuteIcon,
} from "../../Icons";
import { ListMusicIcon, SparkIcon, ClockOnlyIcon, CloseIcon } from "../../UiIcons";
import { useSleepTimer, SLEEP_PRESETS } from "../../../hooks/useSleepTimer";

interface Props {
  track: Track | undefined;
  player: PlayerApi;
  liked: boolean;
  onLike: () => void;
  theme: Theme;
  onOpenQueue: () => void;
  onToast?: (msg: string) => void;
  onSeek?: (pos: number) => void;
}

function fmtTime(s: number): string {
  if (isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

export function MobilePlayerScreen({
  track,
  player,
  liked,
  onLike,
  theme,
  onOpenQueue,
  onToast,
  onSeek,
}: Props) {
  const [showSleepModal, setShowSleepModal] = useState(false);
  const toastFn = onToast || (() => {});
  const { sleepSeconds, formatted: formattedSleep, isEndTrack, setTimer, cancelTimer } = useSleepTimer(player, toastFn);
  if (!track) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-[var(--dim)]">No track playing</p>
        <button
          onClick={onOpenQueue}
          className="mt-3 rounded-xl px-4 py-2 text-xs font-bold text-black"
          style={{ background: "var(--acc0)" }}
        >
          Open Queue
        </button>
      </div>
    );
  }

  return (
    <div className="scroll-slim flex h-full flex-col justify-between overflow-y-auto px-4 py-3">
      {/* 1. Disc Stage (Vinyl + Audio Beat Spectrum + Track Title + Like) */}
      <div className="flex shrink-0 items-center justify-center pt-1">
        <div className="w-full max-w-[290px]">
          <DiscStage
            track={track}
            playing={player.playing}
            buffering={player.buffering}
            ready={player.ready}
            time={player.time}
            duration={player.duration}
            buffered={player.buffered}
            liked={liked}
            onLike={onLike}
            theme={theme}
            size="md"
          />
        </div>
      </div>

      {/* 2. Scrub Bar & Timers */}
      <div className="mt-3 flex shrink-0 flex-col gap-1.5 px-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={player.duration || 100}
            step={0.5}
            value={player.time}
            onChange={(e) => {
              const val = Number(e.target.value);
              player.seek(val);
              onSeek?.(val);
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--acc0)]"
          />
        </div>

        <div className="flex items-center justify-between font-tmono text-[10px] text-[var(--dim)]/80">
          <span>{fmtTime(player.time)}</span>
          <span>{fmtTime(player.duration)}</span>
        </div>
      </div>

      {/* 3. Primary Controls (Shuffle, Prev, Play/Pause, Next, Repeat) */}
      <div className="mt-2 flex shrink-0 items-center justify-between px-3">
        {/* Shuffle */}
        <button
          type="button"
          onClick={player.cycleShuffle}
          className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors active:scale-90 ${
            player.shuffleMode !== "off" ? "text-[var(--acc0)]" : "text-[var(--dim)]"
          }`}
          aria-label="Shuffle"
        >
          <ShuffleIcon size={18} />
          {player.shuffleMode === "magic" && (
            <span className="absolute bottom-0 text-[var(--acc0)]"><SparkIcon size={10} /></span>
          )}
        </button>

        {/* Previous */}
        <button
          type="button"
          onClick={player.prev}
          className="grid h-12 w-12 place-items-center rounded-full text-[var(--ink)] transition-transform active:scale-90"
          aria-label="Previous"
        >
          <PrevIcon size={22} />
        </button>

        {/* Play / Pause Primary Button */}
        <button
          type="button"
          onClick={player.toggle}
          className="grid h-16 w-16 place-items-center rounded-full font-bold text-black shadow-xl transition-transform active:scale-95"
          style={{
            background: "var(--acc0)",
            boxShadow: "0 8px 24px -4px var(--acc0)",
          }}
          aria-label={player.playing ? "Pause" : "Play"}
        >
          {player.playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={player.next}
          className="grid h-12 w-12 place-items-center rounded-full text-[var(--ink)] transition-transform active:scale-90"
          aria-label="Next"
        >
          <NextIcon size={22} />
        </button>

        {/* Repeat */}
        <button
          type="button"
          onClick={player.cycleRepeat}
          className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors active:scale-90 ${
            player.repeat !== "off" ? "text-[var(--acc0)]" : "text-[var(--dim)]"
          }`}
          aria-label="Repeat"
        >
          <RepeatIcon size={18} />
          {player.repeat === "one" && (
            <span className="absolute -top-0.5 right-1 font-tmono text-[8px] font-bold text-[var(--acc0)]">
              1
            </span>
          )}
        </button>
      </div>

      {/* 4. Secondary Row: Volume, Speed & Queue Shortcut */}
      <div className="mt-3 flex shrink-0 items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
        {/* Volume */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={player.toggleMute}
            className="text-[var(--dim)] hover:text-white"
          >
            {player.muted || player.volume === 0 ? (
              <MuteIcon size={16} />
            ) : (
              <VolumeIcon size={16} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={player.muted ? 0 : player.volume}
            onChange={(e) => player.setVol(Number(e.target.value))}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/15 accent-[var(--acc0)]"
          />
        </div>

        {/* Speed, Sleep & Queue Link */}
        <div className="flex items-center gap-1.5">
          {/* Sleep Timer button */}
          <button
            type="button"
            onClick={() => setShowSleepModal(true)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-tmono text-[10px] font-semibold transition-colors active:scale-95 ${
              sleepSeconds !== null
                ? "border-[var(--acc0)]/40 bg-[var(--acc0)]/15 text-[var(--acc0)]"
                : "border-white/10 bg-white/5 text-[var(--dim)] hover:text-white"
            }`}
            title="Sleep Timer"
          >
            <ClockOnlyIcon size={12} className={sleepSeconds !== null ? "animate-pulse" : ""} />
            <span>{sleepSeconds !== null ? (isEndTrack ? "End" : formattedSleep) : "Sleep"}</span>
          </button>

          <button
            type="button"
            onClick={player.cycleRate}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-tmono text-[10px] font-semibold text-[var(--dim)] hover:text-white active:scale-95"
          >
            {player.rate}x
          </button>

          <button
            type="button"
            onClick={onOpenQueue}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-display text-[10px] font-bold text-[var(--ink)] hover:text-white active:scale-95"
          >
            <ListMusicIcon size={13} />
            <span>Queue</span>
          </button>
        </div>
      </div>

      {/* Sleep Timer Sheet Modal */}
      {showSleepModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-md"
          onClick={() => setShowSleepModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c1220]/95 p-4 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClockOnlyIcon size={16} className="text-[var(--acc0)]" />
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  Stop audio in
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSleepModal(false)}
                className="grid h-7 w-7 place-items-center rounded-lg text-[var(--dim)] hover:text-white"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {sleepSeconds !== null && (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-[var(--acc0)]/30 bg-[var(--acc0)]/10 px-3 py-2">
                <span className="text-xs font-medium text-[var(--ink)]">Active Timer:</span>
                <span className="font-tmono text-xs font-bold text-[var(--acc0)]">
                  {isEndTrack ? "End of current track" : `${formattedSleep} remaining`}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {SLEEP_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setTimer(p.seconds);
                    toastFn(`Sleep timer set to ${p.label}`);
                    setShowSleepModal(false);
                  }}
                  className="rounded-xl border border-white/8 bg-white/5 py-2.5 font-display text-xs font-bold text-[var(--ink)] transition-colors hover:border-[var(--acc0)] hover:text-[var(--acc0)] active:scale-95"
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const rem = Math.max(15, Math.round(player.duration - player.time));
                  setTimer(rem, true);
                  toastFn("Sleep timer set to End of Track");
                  setShowSleepModal(false);
                }}
                className="rounded-xl border border-white/8 bg-white/5 py-2.5 font-display text-xs font-bold text-[var(--acc0)] transition-colors hover:border-[var(--acc0)] active:scale-95"
              >
                End of Track
              </button>
              {sleepSeconds !== null && (
                <button
                  type="button"
                  onClick={() => {
                    cancelTimer();
                    toastFn("Sleep timer turned off");
                    setShowSleepModal(false);
                  }}
                  className="rounded-xl border border-[#f43f5e]/30 bg-[#f43f5e]/10 py-2.5 font-display text-xs font-bold text-[#f43f5e] active:scale-95"
                >
                  Turn Off Timer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

