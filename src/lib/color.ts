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

export function clearColorCache(): void {
  _rgbaCache.clear();
}

/** Parses #hex to { h, s, v } (h: 0-360, s: 0-1, v: 0-1) */
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const num = parseInt(full, 16) || 0;
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s, v };
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hNorm = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = v - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hNorm < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hNorm < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hNorm < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hNorm < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hNorm < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

/** Converts HSV to #hex string */
export function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Derives harmonious acc1, acc2 and orbs from a primary custom accent */
export function deriveAccents(accentHex: string): { acc0: string; acc1: string; acc2: string; orbs: string[] } {
  const clean = accentHex.startsWith("#") ? accentHex : `#${accentHex}`;
  const { h, s, v } = hexToHsv(clean);
  const acc0 = clean;
  // Harmonious analogous shifts
  const acc1 = hsvToHex((h + 26) % 360, Math.max(0.35, s * 0.9), Math.max(0.75, v));
  const acc2 = hsvToHex((h + 52) % 360, Math.max(0.3, s * 0.8), Math.min(1, v * 1.06));
  const orb0 = hsvToHex((h - 22 + 360) % 360, Math.min(1, s * 1.05), v);
  const orb1 = acc1;
  const orb2 = acc2;
  return {
    acc0,
    acc1,
    acc2,
    orbs: [orb0, orb1, orb2],
  };
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
