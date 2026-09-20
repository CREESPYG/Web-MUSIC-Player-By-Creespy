import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Track } from "../lib/trackModel";
import type { Theme } from "../themes";
import { beat } from "../hooks/useBeat";
import { cn } from "../utils/cn";
import { HeartIcon } from "./Icons";
import { YouTubeMark, LyricsIcon, MicIcon } from "./UiIcons";
import { useAudioCapture } from "../hooks/useAudioCapture";

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
  onToggleLyrics?: () => void;
  showLyrics?: boolean;
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
  theme,
  size = "lg",
  onToggleLyrics,
  showLyrics = false,
}: Props) {
  const { capturing, toggleCapture } = useAudioCapture();
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

  /* Precomputed unit angles for 64 visualizer bars — eliminates Math.sin/cos calls per frame */
  const barAngles = useRef(
    Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2 - Math.PI / 2;
      return { cos: Math.cos(a), sin: Math.sin(a) };
    })
  ).current;

  const playingRef = useRef(playing);
  playingRef.current = playing;
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    wakeRef.current();
  }, [playing]);

  /* Circular audio spectrum visualizer — sleeps completely when paused or hidden */
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let S = 0;
    let visible = !document.hidden;

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const N = barAngles.length;

    const drawFrame = (now: number, isResting = false) => {
      const b = isResting ? { bars: [] as any, level: 0, bass: 0, pulse: 0 } : beat.read(now);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      const cx = S / 2;
      const cy = S / 2;
      const r0 = S * 0.388; // outer rim of disc

      // 1. Dynamic Bass Shockwave Ring on kicks
      if (!isResting && b.bass > 0.3) {
        const shockR = r0 + b.bass * (S * 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy, shockR, 0, Math.PI * 2);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = theme.acc0;
        ctx.globalAlpha = Math.min(0.55, b.bass * 0.6);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // 2. High-Energy 64-Band Material You Spectrum Halo
      ctx.lineCap = "round";
      const lineWidth = Math.max(2.4, S * 0.011);
      ctx.lineWidth = lineWidth;

      for (let i = 0; i < N; i++) {
        const v = isResting ? 0.06 : b.bars[i] || 0;
        const { cos, sin } = barAngles[i];
        // Dynamic amplitude scaling: reactive to bass, volume & transients
        const len = 4 + Math.pow(v, 1.15) * (S * 0.16);

        const x1 = cx + cos * r0;
        const y1 = cy + sin * r0;
        const x2 = cx + cos * (r0 + len);
        const y2 = cy + sin * (r0 + len);

        // Material You dynamic theme gradient
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        const alpha = isResting ? 0.25 : Math.min(1.0, 0.45 + v * 0.55);
        grad.addColorStop(0, theme.acc0);
        grad.addColorStop(0.65, theme.acc1);
        grad.addColorStop(1, theme.acc2);

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Glowing spark tip on strong transients
        if (!isResting && v > 0.42) {
          ctx.beginPath();
          ctx.arc(x2, y2, Math.min(2.5, lineWidth * 0.65), 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1.0;
    };

    const resize = () => {
      S = box.clientWidth;
      canvas.width = Math.round(S * dpr);
      canvas.height = Math.round(S * dpr);
      // Draw resting state if paused
      if (!playingRef.current) drawFrame(performance.now(), true);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    let lastDraw = 0;
    const draw = (now: number) => {
      if (!playingRef.current) {
        // Render resting frame once and sleep
        drawFrame(now, true);
        return;
      }

      // Smooth 60fps rendering
      if (now - lastDraw < 15) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDraw = now;

      drawFrame(now, false);
      raf = requestAnimationFrame(draw);
    };

    const startLoop = () => {
      if (!visible) return;
      cancelAnimationFrame(raf);
      if (playingRef.current) {
        raf = requestAnimationFrame(draw);
      } else {
        drawFrame(performance.now(), true);
      }
    };
    wakeRef.current = startLoop;

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) {
        lastDraw = 0;
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
  }, [playing]);

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

        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleLyrics && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.88 }}
              onClick={onToggleLyrics}
              title={showLyrics ? "Switch to Vinyl Disc" : "Show Synchronized Lyrics (LRCLIB)"}
              aria-label="Toggle Lyrics"
              aria-pressed={showLyrics}
              className={cn(
                "glass-soft grid h-10 w-10 place-items-center rounded-full transition-all",
                showLyrics
                  ? "bg-[var(--acc0)]/20 text-[var(--acc0)] border border-[var(--acc0)]/40 shadow-sm"
                  : "text-[var(--dim)] hover:text-white"
              )}
            >
              <LyricsIcon size={17} />
            </motion.button>
          )}

          {/* Real Audio / Mic capture toggle for 100% hardware visualizer */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            onClick={toggleCapture}
            title={
              capturing
                ? "Hardware Audio Mode Active (Click to disconnect)"
                : "Connect System / Mic Audio for Realtime FFT Visualizer"
            }
            aria-label="Toggle Hardware Audio Capture"
            className={cn(
              "glass-soft grid h-10 w-10 place-items-center rounded-full transition-all relative",
              capturing
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 shadow-sm"
                : "text-[var(--dim)] hover:text-white"
            )}
          >
            <MicIcon size={17} />
            {capturing && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </motion.button>

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
              className="glass-soft grid h-10 w-10 place-items-center rounded-full transition-colors hover:text-white shadow-sm"
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
    </div>
  );
}
