import React, { useEffect, useRef, useState } from "react";
import { CavaEngine } from "../lib/cavaEngine";
import { beat } from "../hooks/useBeat";
import type { Theme } from "../themes";

export type CavaMode = "bars" | "mirrored" | "blocks";

interface Props {
  playing: boolean;
  theme: Theme;
  className?: string;
  defaultMode?: CavaMode;
}

export const CavaVisualizer: React.FC<Props> = ({
  playing,
  theme,
  className = "",
  defaultMode = "bars",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CavaMode>(defaultMode);
  const [showPeaks, setShowPeaks] = useState(true);

  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const numBars = mode === "mirrored" ? 40 : 48;
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

      // Read audio data from beat engine
      const b = beat.read(now);
      const isResting = !playingRef.current;
      const bars = engine.update(b.bars, dt, isResting);

      // Render based on CAVA mode
      if (mode === "mirrored") {
        // Mirrored mode: center out
        const halfN = bars.length / 2;
        const barWidth = Math.max(3, (w / 2 - halfN * 2.5) / halfN);
        const gap = 2.5;
        const centerX = w / 2;

        for (let i = 0; i < halfN; i++) {
          const bar = bars[i];
          const barH = Math.max(3, bar.value * (h - 8));
          const peakH = Math.max(3, bar.peak * (h - 8));

          // Gradient fill
          const grad = ctx.createLinearGradient(0, h, 0, h - barH);
          grad.addColorStop(0, theme.acc1);
          grad.addColorStop(1, theme.acc0);
          ctx.fillStyle = grad;

          // Right side
          const xR = centerX + i * (barWidth + gap) + gap / 2;
          const yR = h - barH;
          ctx.beginPath();
          ctx.roundRect(xR, yR, barWidth, barH, [barWidth / 2, barWidth / 2, 0, 0]);
          ctx.fill();

          // Left side
          const xL = centerX - (i + 1) * (barWidth + gap) + gap / 2;
          ctx.beginPath();
          ctx.roundRect(xL, yR, barWidth, barH, [barWidth / 2, barWidth / 2, 0, 0]);
          ctx.fill();

          // Floating Peak Caps
          if (showPeaks && !isResting) {
            ctx.fillStyle = theme.ink;
            ctx.fillRect(xR, h - peakH - 2, barWidth, 2);
            ctx.fillRect(xL, h - peakH - 2, barWidth, 2);
          }
        }
      } else if (mode === "blocks") {
        // Terminal / Matrix Block style (segmented CAVA)
        const N = bars.length;
        const barWidth = Math.max(3, (w - (N - 1) * 2.5) / N);
        const gap = 2.5;
        const totalW = N * barWidth + (N - 1) * gap;
        const startX = (w - totalW) / 2;
        const blockH = 4;
        const blockGap = 2;
        const maxBlocks = Math.floor((h - 6) / (blockH + blockGap));

        for (let i = 0; i < N; i++) {
          const bar = bars[i];
          const activeBlocks = Math.round(bar.value * maxBlocks);
          const peakBlock = Math.round(bar.peak * maxBlocks);
          const x = startX + i * (barWidth + gap);

          for (let bIdx = 0; bIdx < maxBlocks; bIdx++) {
            const y = h - (bIdx + 1) * (blockH + blockGap);
            const frac = bIdx / maxBlocks;

            if (bIdx <= activeBlocks) {
              ctx.fillStyle = frac > 0.75 ? theme.acc2 : frac > 0.4 ? theme.acc0 : theme.acc1;
              ctx.fillRect(x, y, barWidth, blockH);
            } else if (showPeaks && bIdx === peakBlock && !isResting) {
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(x, y, barWidth, blockH);
            }
          }
        }
      } else {
        // Classic Smooth CAVA Equalizer Pillars with Floating Peak Caps
        const N = bars.length;
        const barWidth = Math.max(3.2, (w - (N - 1) * 3) / N);
        const gap = 3;
        const totalW = N * barWidth + (N - 1) * gap;
        const startX = (w - totalW) / 2;

        for (let i = 0; i < N; i++) {
          const bar = bars[i];
          const barH = Math.max(3, bar.value * (h - 8));
          const peakH = Math.max(3, bar.peak * (h - 8));
          const x = startX + i * (barWidth + gap);
          const y = h - barH;

          // Material 3 Vertical Gradient
          const grad = ctx.createLinearGradient(0, h, 0, y);
          grad.addColorStop(0, theme.acc1);
          grad.addColorStop(0.7, theme.acc0);
          grad.addColorStop(1, theme.acc2);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, [barWidth / 2, barWidth / 2, 1, 1]);
          ctx.fill();

          // CAVA Floating Peak Cap
          if (showPeaks && !isResting) {
            const peakY = h - peakH - 3;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.roundRect(x, peakY, barWidth, 2.2, 1);
            ctx.fill();
          }
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mode, showPeaks, theme.acc0, theme.acc1, theme.acc2, theme.ink]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col justify-between rounded-[24px] border border-white/8 bg-white/[0.03] p-3 w-full max-w-[580px] mx-auto select-none transition-all ${className}`}
    >
      {/* Top Header Strip with CAVA Telemetry & Mode Switches */}
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/6 px-1">
        <div className="flex items-center gap-2">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--acc0)]" />
          <span className="font-tmono text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--ink)]">
            CAVA SPECTRUM
          </span>
          <span className="font-tmono text-[9px] uppercase tracking-wider text-[var(--dim)] hidden sm:inline">
            Monstercat DSP · 60 FPS
          </span>
        </div>

        {/* Mode Selector Chips */}
        <div className="flex items-center gap-1">
          <md-filter-chip
            label="Bars"
            selected={mode === "bars"}
            onClick={() => setMode("bars")}
            style={{ "--md-filter-chip-container-height": "24px", "--md-filter-chip-label-text-size": "9.5px" } as any}
          />
          <md-filter-chip
            label="Mirror"
            selected={mode === "mirrored"}
            onClick={() => setMode("mirrored")}
            style={{ "--md-filter-chip-container-height": "24px", "--md-filter-chip-label-text-size": "9.5px" } as any}
          />
          <md-filter-chip
            label="Blocks"
            selected={mode === "blocks"}
            onClick={() => setMode("blocks")}
            style={{ "--md-filter-chip-container-height": "24px", "--md-filter-chip-label-text-size": "9.5px" } as any}
          />
          <md-filter-chip
            label="Peaks"
            selected={showPeaks}
            onClick={() => setShowPeaks(!showPeaks)}
            style={{ "--md-filter-chip-container-height": "24px", "--md-filter-chip-label-text-size": "9.5px" } as any}
          />
        </div>
      </div>

      {/* Main High-Performance CAVA Canvas */}
      <div className="relative h-20 w-full">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden />
      </div>

      {/* Frequency Labels */}
      <div className="flex justify-between items-center px-1 pt-1.5 text-[8.5px] font-tmono text-[var(--dim)] uppercase tracking-widest border-t border-white/5">
        <span>20 Hz</span>
        <span>250 Hz</span>
        <span>1 kHz</span>
        <span>4 kHz</span>
        <span>16 kHz</span>
      </div>
    </div>
  );
};
