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

  // Reset the window whenever the item array is replaced (new playlist / new queue).
  useEffect(() => {
    setCount(Math.min(initial, items.length));
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