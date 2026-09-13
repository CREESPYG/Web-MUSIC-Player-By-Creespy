import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Track } from "../lib/trackModel";
import type { Theme } from "../themes";
import { beat } from "../hooks/useBeat";
import { hexToRgba } from "../lib/color";
import { cn } from "../utils/cn";
import { HeartIcon } from "./Icons";
import { YouTubeMark } from "./UiIcons";

interface Props {
  track: Track;
  playing: boolean;
  buffering: boolean;
  ready: boolean;
  time: number;
  duration: number;
  buffered: number;
  liked: boolean;
  onLike: () => void;
  theme: Theme;
  size?: "md" | "lg";
}

const R = 98;
const C = 2 * Math.PI * R;

export function DiscStage({
  track,
  playing,
  buffering,
  ready,
  time,
  duration,
  buffered,
  liked,
  onLike,
  size = "lg",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [burst, setBurst] = useState(0);
  const progress = duration > 0 ? Math.min(1, time / duration) : 0;

  const videoId = track.videoId;
  const baseThumb = (track.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  const highResThumb = baseThumb
    .replace("hqdefault.jpg", "maxresdefault.jpg")
    .replace("sddefault.jpg", "maxresdefault.jpg")
    .replace("mqdefault.jpg", "maxresdefault.jpg");

  const fallbackChain = [
    highResThumb,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    baseThumb,
  ].filter((url, i, arr) => arr.indexOf(url) === i && url);

  /* Circular audio spectrum visualizer — throttled to ~30fps, pauses on hidden tab */
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let S = 0;
    let frameCount = 0;
    let visible = !document.hidden;

    /* DPR capped to 1.5 for the spectrum visualizer */
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);

    const resize = () => {
      S = box.clientWidth;
      canvas.width = Math.round(S * dpr);
      canvas.height = Math.round(S * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    /* Reduced from 64 → 48 bars — still looks full */
    const N = 48;
    const draw = (now: number) => {
      // Throttle to ~30fps: skip every other frame
      frameCount++;
      if (frameCount % 2 !== 0) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const b = beat.read(now);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      const cx = S / 2;
      const cy = S / 2;
      const r0 = S * 0.385;

      ctx.lineCap = "round";
      for (let i = 0; i < N; i++) {
        const v = b.bars[Math.floor((i / N) * b.bars.length)] || 0;
        const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
        const len = 3 + v * S * 0.06;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
        ctx.strokeStyle = hexToRgba("#ffffff", 0.1 + v * 0.45);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };

    const startLoop = () => {
      if (!visible) return;
      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) {
        frameCount = 0;
        startLoop();
      } else {
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    startLoop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-col items-center gap-4 w-full">
      {/* Vinyl Disc Canvas Container */}
      <div
        ref={boxRef}
        className={cn(
          "relative aspect-square shrink-0",
          size === "lg" ? "w-[min(72vw,38vh,360px)]" : "w-[min(50vw,28vh,260px)]"
        )}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden />

        {/* Circular Progress & Buffer SVG */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90 pointer-events-none">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - buffered)}
          />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="var(--acc0)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: "stroke-dashoffset 0.25s linear" }}
          />
        </svg>

        {/* Vinyl Disc Body */}
        <div className="absolute inset-[11%] overflow-hidden rounded-full bg-gradient-to-br from-[#0a0f1a] to-[#1a1025] shadow-[0_16px_48px_rgba(0,0,0,0.6)] ring-1 ring-white/15">
          {/* Concentric Vinyl Grooves Overlay */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none opacity-30"
            style={{
              backgroundImage: `repeating-radial-gradient(
                circle at center,
                transparent 0,
                transparent 4px,
                rgba(255, 255, 255, 0.05) 5px,
                transparent 6px
              )`,
            }}
          />

          {/* Album Cover Art (Strict Aspect Ratio & Centered Fit) */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.img
                key={track.videoId}
                src={highResThumb}
                onError={(e) => {
                  const currentSrc = e.currentTarget.src;
                  const currentIdx = fallbackChain.indexOf(currentSrc);
                  const nextIdx = currentIdx + 1;
                  if (nextIdx < fallbackChain.length) {
                    e.currentTarget.src = fallbackChain[nextIdx];
                  }
                }}
                alt={track.title}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.04 }}
                transition={{ duration: 0.35 }}
                className={cn(
                  "disc-spin absolute inset-0 h-full w-full rounded-full object-cover select-none pointer-events-none motion-reduce:animate-none",
                  playing ? "disc-spin-on" : ""
                )}
                draggable={false}
              />
            </AnimatePresence>
          </div>

          {/* Radial Light Reflection */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.2) 0%, transparent 45%),
                           radial-gradient(circle at 70% 75%, rgba(255, 255, 255, 0.06) 0%, transparent 50%)`,
            }}
          />

          {/* Center Brass Hole & Spindle Ring */}
          <div className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-[#05070c] shadow-inner flex items-center justify-center">
            <div className="h-[36%] w-[36%] rounded-full border border-white/40 bg-[#020305]" />
          </div>
        </div>

        {/* Buffering Indicator */}
        <AnimatePresence>
          {buffering && ready && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-[11%] grid place-items-center rounded-full bg-black/60 backdrop-blur-[2px]"
            >
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-[var(--acc0)]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Track Metadata Strip */}
      <div className="flex w-full max-w-[420px] shrink-0 items-center justify-between gap-3 px-2">
        <div className="min-w-0 text-left flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={track.videoId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="truncate font-display text-[16px] md:text-[18px] font-bold leading-tight text-[var(--ink)]">
                {track.title}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] font-medium text-[var(--dim)]">
                <YouTubeMark size={13} />
                <span>{track.artist}</span>
                {track.album && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="opacity-80 truncate">{track.album}</span>
                  </>
                )}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative shrink-0">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            onClick={() => {
              if (!liked) setBurst((b) => b + 1);
              onLike();
            }}
            aria-label="Favorite track"
            aria-pressed={liked}
            className="glass-soft grid h-10 w-10 place-items-center rounded-full transition-shadow hover:shadow-[0_0_15px_var(--acc0)]"
          >
            <HeartIcon filled={liked} size={18} />
          </motion.button>

          {burst > 0 && (
            <motion.span
              key={burst}
              initial={{ scale: 0.5, opacity: 1 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.45 }}
              className="pointer-events-none absolute inset-0 grid place-items-center"
            >
              <HeartIcon filled size={18} />
            </motion.span>
          )}
        </div>
      </div>
    </div>
  );
}
