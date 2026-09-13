import { useEffect, useRef } from "react";
import type { Theme } from "../themes";
import { beat } from "../hooks/useBeat";
import { hexToRgba } from "../lib/color";
import type { BgStyle } from "../hooks/useSettings";

const ORBS = [
  { bx: 0.2, by: 0.26, r: 0.52, f1: 0.052, f2: 0.034, p: 0 },
  { bx: 0.8, by: 0.2, r: 0.44, f1: 0.044, f2: 0.061, p: 2.1 },
  { bx: 0.7, by: 0.8, r: 0.5, f1: 0.036, f2: 0.027, p: 4.2 },
  { bx: 0.28, by: 0.84, r: 0.38, f1: 0.063, f2: 0.047, p: 1.2 },
];

/** Reduced particle count: 24 (down from 54) — still visually rich, halves loop cost */
const PARTICLE_COUNT = 24;

/** Waveform sampling step: 12px (down from 6) — curves are smooth, halves path points */
const WAVE_STEP = 12;

/**
 * Full-viewport music-reactive backdrop. Style switchable:
 *  dynamic — orbs + ribbons + particles · wave — ribbons/particles only
 *  solid — clean gradient · media — transparent so custom media shows through
 *
 * Performance: throttled to ~30fps, pauses when tab is hidden,
 * DPR capped to 1.0 (blurred/soft backdrop doesn't need retina).
 */
export function BackgroundCanvas({ theme, style, fx }: { theme: Theme; style: BgStyle; fx: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cfg = useRef({ theme, style, fx });
  cfg.current = { theme, style, fx };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;
    let frameCount = 0;
    let visible = !document.hidden;
    const mouse = { x: 0.5, y: 0.5 };

    /* DPR capped to 1.0 — background is blurred/soft, retina resolution is wasted GPU memory */
    const dpr = 1;

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    };
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);

    const parts = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() * 1.8 + 0.5,
      v: Math.random() * 0.018 + 0.006,
      tw: Math.random() * Math.PI * 2,
    }));

    const draw = (now: number) => {
      // Throttle to ~30fps: skip every other frame
      frameCount++;
      if (frameCount % 2 !== 0) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const { theme: t, style: st, fx: f } = cfg.current;
      const b = beat.read(now);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const media = st === "media";
      const solid = st === "solid";

      // base wash (skipped for media so the custom layer stays visible)
      if (!media) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, t.bg0);
        g.addColorStop(0.55, t.bg1);
        g.addColorStop(1, t.bg0);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      if (!solid) {
        ctx.globalCompositeOperation = "lighter";

        // reactive orbs (dynamic only)
        if (st === "dynamic") {
          ORBS.forEach((o, i) => {
            const col = t.orbs[i % t.orbs.length];
            const px =
              (o.bx + Math.sin(now * 0.001 * o.f1 * Math.PI * 2 + o.p) * 0.09 + (mouse.x - 0.5) * 0.06) * w;
            const py =
              (o.by + Math.cos(now * 0.001 * o.f2 * Math.PI * 2 + o.p) * 0.08 + (mouse.y - 0.5) * 0.06) * h;
            const energy = (0.82 + b.bass * 0.5 + b.pulse * 0.22) * f;
            const rr = o.r * Math.min(w, h) * 0.5 * Math.max(0.25, energy);
            const rg = ctx.createRadialGradient(px, py, 0, px, py, rr);
            rg.addColorStop(0, hexToRgba(col, (0.15 + b.level * 0.16) * f * (media ? 0.75 : 1)));
            rg.addColorStop(1, hexToRgba(col, 0));
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(px, py, rr, 0, Math.PI * 2);
            ctx.fill();
          });
        }

        // waveform ribbons (step increased to 12px for fewer path points)
        const amp = st === "wave" ? 1.45 : 1;
        const yBase = h * (st === "wave" ? 0.5 : 0.8);
        for (let line = 0; line < 2; line++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += WAVE_STEP) {
            const fr = x / w;
            const a = (10 + b.level * 95) * (0.35 + 0.65 * Math.sin(fr * Math.PI)) * amp * f;
            const y =
              yBase +
              line * 16 +
              Math.sin(fr * 9 + now / (line ? 900 : 640)) * a * 0.5 +
              Math.sin(fr * 23 - now / 470 + line * 2) * a * 0.3;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          const lg = ctx.createLinearGradient(0, 0, w, 0);
          const c = line ? t.acc2 : t.acc0;
          lg.addColorStop(0, hexToRgba(c, 0));
          lg.addColorStop(0.5, hexToRgba(c, (line ? 0.22 : 0.5) * f + b.level * 0.3 * f));
          lg.addColorStop(1, hexToRgba(c, 0));
          ctx.strokeStyle = lg;
          ctx.lineWidth = line ? 1 : 1.7;
          ctx.shadowColor = hexToRgba(t.acc0, 0.7);
          ctx.shadowBlur = line ? 0 : 16;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // drifting particles
        parts.forEach((p) => {
          p.y -= p.v * (0.5 + b.level * 1.7) * f;
          if (p.y < -0.02) {
            p.y = 1.02;
            p.x = Math.random();
          }
          const a = Math.min(0.75, (0.1 + 0.5 * Math.abs(Math.sin(now / 900 + p.tw))) * (0.35 + b.level) * f);
          ctx.fillStyle = hexToRgba(t.acc1, a);
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, p.s, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.globalCompositeOperation = "source-over";
      }

      // vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.max(w, h) * 0.78);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, media ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    };

    // Start the loop only when tab is visible
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
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="fixed inset-0 z-[2] h-full w-full" aria-hidden />;
}
