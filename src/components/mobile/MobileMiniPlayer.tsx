import { motion } from "motion/react";
import type { Track } from "../../lib/trackModel";
import type { PlayerApi } from "../Controls";
import { PlayIcon, PauseIcon, NextIcon, HeartIcon } from "../Icons";

interface Props {
  track: Track | undefined;
  player: PlayerApi;
  liked: boolean;
  onLike: () => void;
  onOpenPlayer: () => void;
}

export function MobileMiniPlayer({ track, player, liked, onLike, onOpenPlayer }: Props) {
  if (!track) return null;

  const progress = player.duration > 0 ? Math.min(100, (player.time / player.duration) * 100) : 0;
  const thumb = track.thumb || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      onClick={onOpenPlayer}
      className="relative mx-2.5 mb-1.5 flex h-14 shrink-0 cursor-pointer items-center justify-between overflow-hidden rounded-[20px] border border-white/8 bg-[var(--bg1,#161e28)] px-3 select-none shadow-none transition-all active:scale-[0.99]"
    >
      {/* Track Artwork + Details */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 shadow-sm">
          <img
            src={thumb}
            alt={track.title}
            className={`h-full w-full object-cover ${player.playing ? "animate-[spin_12s_linear_infinite]" : ""}`}
            style={{ animationPlayState: player.playing ? "running" : "paused" }}
          />
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="truncate font-display text-xs font-bold text-[var(--ink)]">
            {track.title}
          </span>
          <span className="truncate text-[10px] text-[var(--dim)]">
            {track.artist || "CREESPY"}
          </span>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {/* Like */}
        <button
          type="button"
          onClick={onLike}
          className={`grid h-8 w-8 place-items-center rounded-full transition-colors active:scale-90 ${
            liked ? "text-[#f43f5e]" : "text-[var(--dim)] hover:text-white"
          }`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <HeartIcon filled={liked} size={15} />
        </button>

        {/* Play / Pause */}
        <button
          type="button"
          onClick={player.toggle}
          className="grid h-8 w-8 place-items-center rounded-full font-bold text-[#0d151c] shadow-sm transition-transform active:scale-90"
          style={{ backgroundColor: "var(--acc0)" }}
          aria-label={player.playing ? "Pause" : "Play"}
        >
          {player.playing ? <PauseIcon size={14} /> : <PlayIcon size={14} className="ml-0.5" />}
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={player.next}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--dim)] transition-colors hover:text-white active:scale-90"
          aria-label="Next track"
        >
          <NextIcon size={15} />
        </button>
      </div>

      {/* Progress Line at Bottom Edge */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
        <div
          className="h-full transition-all duration-200"
          style={{ width: `${progress}%`, background: "var(--acc0)" }}
        />
      </div>
    </motion.div>
  );
}
