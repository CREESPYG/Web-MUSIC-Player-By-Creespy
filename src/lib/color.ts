/** Converts a #hex color to an rgba() string (canvas-safe for gradients).
 *  Results are cached — same hex+alpha pairs are reused instead of re-parsed. */
const _rgbaCache = new Map<string, string>();
export function hexToRgba(hex: string, alpha: number): string {
  // Round alpha to 3 decimals to improve cache hit rate
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 1000;
  const key = hex + a;
  const cached = _rgbaCache.get(key);
  if (cached) return cached;

  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(full, 16);
  const result = `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;

  // Cap cache size to prevent unbounded growth
  if (_rgbaCache.size > 512) _rgbaCache.clear();
  _rgbaCache.set(key, result);
  return result;
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
