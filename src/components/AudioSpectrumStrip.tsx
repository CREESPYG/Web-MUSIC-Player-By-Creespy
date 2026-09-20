import { useEffect, useRef } from "react";
import { beat } from "../hooks/useBeat";
import type { Theme } from "../themes";

interface Props {
  playing: boolean;
  theme: Theme;
  className?: string;
}

export function AudioSpectrumStrip({ playing, theme, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const BARS = 36;
    const heights = new Float32Array(BARS);

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
      if (now - lastDraw < 16) {
        raf = requestAnimationFrame(render);
        return;
      }
      lastDraw = now;

      const w = container.clientWidth;
      const h = container.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const b = playingRef.current ? beat.read(now) : { bars: [] as any, bass: 0, mid: 0, treble: 0 };
      const barWidth = Math.max(3, (w - (BARS - 1) * 3) / BARS);
      const gap = 3;
      const totalWidth = BARS * barWidth + (BARS - 1) * gap;
      const startX = Math.max(0, (w - totalWidth) / 2);

      for (let i = 0; i < BARS; i++) {
        // Map 36 bars across 64 beat spectrum bins with non-linear acoustic curve
        const binIndex = Math.floor(Math.pow(i / BARS, 1.25) * 60);
        const raw = playingRef.current ? (b.bars[binIndex] || 0) : 0.05;
        
        // Attack/Decay physics smoothing
        const target = Math.max(0.06, Math.min(1, raw));
        heights[i] += (target - heights[i]) * (target > heights[i] ? 0.72 : 0.24);

        const barH = Math.max(3, heights[i] * (h - 6));
        const x = startX + i * (barWidth + gap);
        const y = (h - barH) / 2;

        // Clean flat Material 3 gradient
        const grad = ctx.createLinearGradient(0, y + barH, 0, y);
        grad.addColorStop(0, theme.acc0);
        grad.addColorStop(1, theme.acc1);

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Rounded bar caps
        const r = barWidth / 2;
        ctx.roundRect(x, y, barWidth, barH, r);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [theme.acc0, theme.acc1]);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-1.5 h-10 w-full max-w-[420px] mx-auto select-none ${className}`}
      title="Live 36-Band Audio Frequency Spectrum"
    >
      <canvas ref={canvasRef} className="h-full w-full pointer-events-none" aria-hidden />
    </div>
  );
}
