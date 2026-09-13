import { useEffect, useRef } from "react";
import type { Theme } from "../themes";
import { hexToRgba } from "../lib/color";

interface Ring {
  x: number;
  y: number;
  t: number;
  ttl: number;
  max: number;
  width: number;
  bright: boolean;
}
interface Drop {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  decay: number;
}

/**
 * Water-drop splash on every click: expanding rings + crown droplets with gravity.
 *
 * Performance: loop sleeps entirely when there are zero active rings/drops,
 * wakes only on the next click. DPR capped to 1.0, droplets reduced 13→8.
 */
export function RippleLayer({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;
    let last = performance.now();
    let loopRunning = false;
    const rings: Ring[] = [];
    const drops: Drop[] = [];

    /* DPR capped to 1.0 — splash effects are fast-fading, retina is wasted */
    const dpr = 1;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const splash = (x: number, y: number) => {
      for (let i = 0; i < 3; i++) {
        rings.push({ x, y, t: -i * 0.1, ttl: 0.85 + i * 0.18, max: 120 + i * 62, width: 2.6 - i * 0.7, bright: false });
      }
      rings.push({ x, y, t: 0, ttl: 0.45, max: 42, width: 3.2, bright: true });
      /* Reduced crown droplets from 13 → 8 — still looks great */
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const sp = 2.4 + Math.random() * 4.6;
        drops.push({
          x,
          y,
          px: x,
          py: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 2.4,
          r: 1 + Math.random() * 2.3,
          life: 1,
          decay: 0.016 + Math.random() * 0.02,
        });
      }
      // Wake the loop if it's sleeping
      if (!loopRunning) {
        loopRunning = true;
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };

    const onDown = (e: PointerEvent) => splash(e.clientX, e.clientY);
    window.addEventListener("pointerdown", onDown);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = themeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        if (r.t < 0) continue;
        const p = r.t / r.ttl;
        if (p >= 1) {
          rings.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - p, 3);
        const rad = 4 + ease * r.max;
        const alpha = Math.pow(1 - p, 1.7);
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        ctx.strokeStyle = r.bright ? `rgba(255,255,255,${alpha * 0.9})` : hexToRgba(t.acc0, alpha * 0.75);
        ctx.lineWidth = r.width * (1 - p * 0.6);
        ctx.shadowColor = hexToRgba(t.acc0, alpha);
        ctx.shadowBlur = r.bright ? 18 : 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.px = d.x;
        d.py = d.y;
        d.vy += 260 * dt;
        d.x += d.vx * 60 * dt;
        d.y += d.vy * 60 * dt * 0.35;
        d.life -= d.decay * 60 * dt * 0.5;
        if (d.life <= 0) {
          drops.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(d.px, d.py);
        ctx.lineTo(d.x, d.y);
        ctx.strokeStyle = hexToRgba(t.acc2, d.life * 0.5);
        ctx.lineWidth = d.r * 0.9;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * d.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${d.life * 0.85})`;
        ctx.fill();
      }

      // Sleep when there's nothing left to draw — saves CPU entirely
      if (rings.length === 0 && drops.length === 0) {
        loopRunning = false;
        return;
      }

      raf = requestAnimationFrame(draw);
    };
    // Don't start the loop immediately — wait for first click
    loopRunning = false;

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60] h-full w-full" aria-hidden />;
}
