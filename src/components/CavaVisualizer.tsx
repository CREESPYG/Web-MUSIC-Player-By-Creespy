import React, { useEffect, useRef } from "react";
import { CavaEngine } from "../lib/cavaEngine";
import { beat } from "../hooks/useBeat";
import { useAudioCapture } from "../hooks/useAudioCapture";
import { MicIcon } from "./UiIcons";
import type { Theme } from "../themes";

interface Props {
  playing: boolean;
  theme: Theme;
  className?: string;
}

/**
 * Authentic Linux CAVA Audio Spectrum Visualizer
 * Modeled after CAVA (Console-based Audio Visualizer) on Linux.
 * Features:
 * - 40 authentic vertical spectrum bars with tight 2px spacing
 * - Monstercat neighbor smoothing & dynamic auto-sensitivity (autosens)
 * - Linux CAVA ballistic physics: instant attack, gravity falloff, floating peak caps
 * - Dual engine: 100% genuine real-time hardware FFT + phase-locked musical beat sync
 * - Google Material 3 Expressive container with zero glassmorphism
 */
export const CavaVisualizer: React.FC<Props> = ({
  playing,
  theme,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { capturing, toggleCapture } = useAudioCapture();

  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Standard Linux CAVA 40-bar frequency distribution
    const numBars = 40;
    const engine = new CavaEngine(numBars);
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let lastDraw = 0;

    const render = (now: number) => {
      if (now - lastDraw < 15) {
        raf = requestAnimationFrame(render);
        return;
      }
      const dt = lastDraw ? Math.min(0.05, (now - lastDraw) / 1000) : 0.016;
      lastDraw = now;

      const w = container.clientWidth;
      const h = container.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Read audio data from phase-locked beat engine or real FFT
      const b = beat.read(now);
      const isResting = !playingRef.current;
      const bars = engine.update(b.bars, dt, isResting);

      // Classic Linux CAVA Bar Equalizer Layout
      const N = bars.length;
      const gap = 2.2; // Tight, clean Linux CAVA gap
      const totalGaps = (N - 1) * gap;
      const barWidth = Math.max(3.0, (w - totalGaps) / N);
      const totalW = N * barWidth + totalGaps;
      const startX = (w - totalW) / 2;

      for (let i = 0; i < N; i++) {
        const bar = bars[i];
        // Dynamic bar height with full dynamic range (10% to 95%)
        const barH = isResting
          ? 2.5
          : Math.max(3.0, Math.min(h - 8, bar.value * (h - 8)));
        const peakH = isResting ? 2.5 : Math.max(3.0, bar.peak * (h - 8));
        const x = startX + i * (barWidth + gap);
        const y = h - barH;

        // Material 3 Vertical Color Gradient
        const grad = ctx.createLinearGradient(0, h, 0, y);
        grad.addColorStop(0, theme.acc1);
        grad.addColorStop(0.7, theme.acc0);
        grad.addColorStop(1, theme.acc2 || theme.acc0);

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Authentic Linux CAVA shape: flat bottom, subtle 1.5px rounded top
        ctx.roundRect(x, y, barWidth, barH, [1.5, 1.5, 0, 0]);
        ctx.fill();

        // Classic Linux CAVA Floating Peak Cap
        if (!isResting && bar.peak > 0.16) {
          const peakY = Math.max(1, h - peakH - 2.5);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.roundRect(x, peakY, barWidth, 1.8, 0.8);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [theme.acc0, theme.acc1, theme.acc2, theme.ink]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col justify-between rounded-[28px] border border-white/8 bg-[var(--bg1,#161e28)] p-3 md:p-4 w-full max-w-[580px] mx-auto select-none shadow-none ${className}`}
    >
      {/* Top Header: Linux CAVA Telemetry & 1-Tap Live Audio Sync */}
      <div className="flex items-center justify-between pb-2 mb-1 px-1 border-b border-white/6">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full transition-colors ${
              playing ? "bg-[var(--acc0)] live-dot" : "bg-white/20"
            }`}
          />
          <span className="font-tmono text-[10.5px] uppercase tracking-[0.22em] font-bold text-[var(--ink)]">
            CAVA SPECTRUM
          </span>
          <span className="hidden sm:inline font-tmono text-[9px] uppercase tracking-wider text-[var(--dim)]">
            {capturing ? "Hardware FFT · 40 Bins" : "Monstercat DSP · 60 FPS"}
          </span>
        </div>

        {/* Material 3 Tonal Pill Chip: 1-Tap Audio Hardware Sync */}
        <button
          onClick={toggleCapture}
          title={
            capturing
              ? "Live hardware audio FFT active (click to disconnect)"
              : "Sync system/microphone audio for 100% live hardware FFT"
          }
          aria-label="Toggle hardware audio FFT"
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-tmono uppercase tracking-wider font-semibold transition-all active:scale-95 ${
            capturing
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
              : "bg-white/8 text-[var(--dim)] hover:text-white hover:bg-white/14 border border-white/10"
          }`}
        >
          <MicIcon size={13} />
          <span>{capturing ? "Live Audio" : "Sync Audio"}</span>
        </button>
      </div>

      {/* Main CAVA Canvas Area */}
      <div className="relative h-16 w-full">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full pointer-events-none"
          aria-hidden
        />
      </div>
    </div>
  );
};
