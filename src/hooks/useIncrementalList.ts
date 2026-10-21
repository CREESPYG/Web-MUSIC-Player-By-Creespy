import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Phase 9 — incremental list rendering for very large playlists/queues
 * (200 / 500 / 1000 / 2000+ tracks) without artificially capping them.
 *
 * Renders an initial window; as the user scrolls the owning scroll container,
 * more items are appended in `step` chunks until the list is exhausted.
 * Alternative to true windowed virtualization — keeps existing Flexbox layout,
 * but still bounds DOM work so a 2000-track playlist scrolls smoothly.
 */
/**
 * Window policy for the incremental list — MUST never shrink the rendered
 * window when the list merely grows (queue/playlist appends). The previous
 * reset (`Math.min(initial, len)` on every new array identity) yanked deep
 * lists back to 250 rows on EVERY add, deleting rendered rows, clamping the
 * scroll position and making the queue visually "restart".
 *
 * - length 0        → 0
 * - window below `initial` (fresh/short list) → grow to `min(initial, len)`
 * - window above len (list shrank)            → clamp to len (no collapse past content)
 * - otherwise                                  → keep the user's deep window as-is
 */
export function clampWindow(count: number, initial: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(count, Math.min(initial, length)), length);
}

export function useIncrementalList<T, C extends HTMLElement = HTMLDivElement, S extends HTMLElement = HTMLDivElement>(
  items: T[],
  { step = 150, initial = 250, buffer = 800 }: { step?: number; initial?: number; buffer?: number } = {}
) {
  const containerRef = useRef<C | null>(null);
  const sentinelRef = useRef<S | null>(null);
  const [count, setCount] = useState(initial);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const countRef = useRef(count);
  countRef.current = count;

  // Keep the window stable across appends; clamp only when the list shrinks.
  useEffect(() => {
    setCount((c) => clampWindow(c, initial, items.length));
  }, [items, initial]);

  // Append chunks while the sentinel sits inside the (nested) scroll container.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const total = itemsRef.current.length;
    const check = () => {
      if (countRef.current >= total) return;
      const el = sentinelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      if (rect.top <= rootRect.bottom + buffer) {
        setCount((c) => Math.min(total, c + step));
      }
    };

    check();
    root.addEventListener("scroll", check, { passive: true });
    return () => root.removeEventListener("scroll", check);
  }, [items, step, buffer]);

  const visible = useMemo(() => (count >= items.length ? items : items.slice(0, count)), [items, count]);

  return { containerRef, sentinelRef, visible, count, hasMore: count < items.length };
}