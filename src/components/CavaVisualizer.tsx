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
 * Minimalist, Flat Material You Sound Spectrum Visualizer
 * Inspired by Google Material You / M3 and MaterialYouNewTab.
 * Clean, distraction-free, fluidly responsive to musical beats and volume.
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

    const numBars = 36;
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

      // Read audio data from high-precision beat engine
      const b = beat.read(now);
      const isResting = !playingRef.current;
      const bars = engine.update(b.bars, dt, isResting);

      // Clean, elegant Material 3 Equalizer Spectrum
      const N = bars.length;
      const gap = 3.5;
      const totalGaps = (N - 1) * gap;
      const barWidth = Math.max(3.5, Math.min(10, (w - totalGaps) / N));
      const totalW = N * barWidth + totalGaps;
      const startX = (w - totalW) / 2;

      for (let i = 0; i < N; i++) {
        const bar = bars[i];
        // Dynamic bar height with full dynamic range (10% to 95%)
        const barH = isResting
          ? 3
          : Math.max(3.5, Math.min(h - 6, bar.value * (h - 6)));
        const peakH = isResting ? 3 : Math.max(3.5, bar.peak * (h - 6));
        const x = startX + i * (barWidth + gap);
        const y = h - barH;

        // Material 3 Vertical Gradient from theme secondary to primary
        const grad = ctx.createLinearGradient(0, h, 0, y);
        grad.addColorStop(0, theme.acc1);
        grad.addColorStop(0.7, theme.acc0);
        grad.addColorStop(1, theme.acc2 || theme.acc0);

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Fully rounded pill top
        ctx.roundRect(x, y, barWidth, barH, [barWidth / 2, barWidth / 2, 2, 2]);
        ctx.fill();

        // Subtle floating peak cap
        if (!isResting && bar.peak > 0.18) {
          const peakY = Math.max(1, h - peakH - 3);
          ctx.fillStyle = theme.ink;
          ctx.beginPath();
          ctx.roundRect(x, peakY, barWidth, 2, 1);
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
      className={`relative flex flex-col justify-between rounded-[28px] border border-white/8 bg-[var(--bg1,#161e28)] p-3 md:p-3.5 w-full max-w-[580px] mx-auto select-none shadow-none ${className}`}
    >
      {/* Top Header: Minimalist indicator + Hardware Audio Sync Toggle */}
      <div className="flex items-center justify-between pb-1.5 mb-1 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              playing ? "bg-[var(--acc0)] live-dot" : "bg-white/20"
            }`}
          />
          <span className="font-tmono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--ink)]">
            Spectrum
          </span>
          {capturing && (
            <span className="font-tmono text-[8.5px] uppercase tracking-wider text-emerald-400 font-medium">
              · Live Hardware FFT
            </span>
          )}
        </div>

        {/* Minimal hardware audio capture button */}
        <button
          onClick={toggleCapture}
          title={
            capturing
              ? "Hardware FFT active (click to disconnect)"
              : "Sync microphone or hardware audio for live FFT"
          }
          aria-label="Toggle hardware audio FFT"
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] font-tmono uppercase tracking-wider transition-all ${
            capturing
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-white/5 text-[var(--dim)] hover:text-white hover:bg-white/10 border border-white/8"
          }`}
        >
          <MicIcon size={12} />
          <span>{capturing ? "Active" : "Sync Mic"}</span>
        </button>
      </div>

      {/* Main Spectrum Visualizer Canvas */}
      <div className="relative h-14 w-full">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full pointer-events-none"
          aria-hidden
        />
      </div>
    </div>
  );
};
