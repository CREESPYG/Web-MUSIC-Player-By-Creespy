import { useEffect, useRef } from "react";
import type { Theme } from "../themes";
import { hexToRgba } from "../lib/color";

/**
 * Soft ambient light that trails the cursor and compresses on press.
 *
 * Performance: uses CSS transition for smooth position lerp instead of
 * a dedicated requestAnimationFrame loop. The browser compositor handles
 * the interpolation on the GPU, eliminating an entire rAF loop.
 */
export function CursorGlow({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const lastTheme = useRef("");

  useEffect(() => {
    const el = ref.current!;

    const onMove = (e: PointerEvent) => {
      el.style.transform = `translate(${e.clientX - 190}px, ${e.clientY - 190}px) scale(1)`;
      el.style.opacity = "1";
      // Update gradient only when theme changes
      const t = themeRef.current;
      if (t.id !== lastTheme.current) {
        lastTheme.current = t.id;
        el.style.background = `radial-gradient(circle, ${hexToRgba(t.acc0, 0.14)} 0%, ${hexToRgba(t.acc1, 0.05)} 38%, rgba(0,0,0,0) 64%)`;
      }
    };
    const onDown = () => {
      el.style.transform = el.style.transform.replace(/scale\([^)]+\)/, "scale(0.7)");
    };
    const onUp = () => {
      el.style.transform = el.style.transform.replace(/scale\([^)]+\)/, "scale(1)");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        transition: "transform 0.12s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.7s ease",
        willChange: "transform",
      }}
      className="pointer-events-none fixed left-0 top-0 z-[5] h-[380px] w-[380px] rounded-full opacity-0 mix-blend-screen"
    />
  );
}
