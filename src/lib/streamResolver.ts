/**
 * Browser-side stream resolver — asks our same-origin function for YouTube
 * stream URLs (resolved server-side, no CORS), caches them until expiry.
 * Playback then happens through a plain HTML5 media element, the way musike
 * plays: native seeking via Range, real background audio, no iframe.
 */

export interface ResolvedAudioStream {
  url: string;
  expireAt: number;
  durationSeconds: number | null;
}

export interface ResolvedVideoStream {
  url: string;
  expireAt: number;
  width: number | null;
  height: number | null;
}

const audioCache = new Map<string, ResolvedAudioStream>();
const videoCache = new Map<string, ResolvedVideoStream>();

/** Reuse a cached stream unless it expires within the next minute. */
function fresh<T extends { expireAt: number }>(hit: T | undefined): T | null {
  return hit && hit.expireAt > Date.now() + 60_000 ? hit : null;
}

export async function resolveAudioStream(videoId: string): Promise<ResolvedAudioStream> {
  const hit = fresh(audioCache.get(videoId));
  if (hit) return hit;
  const r = await fetch(`/.netlify/functions/innertube?id=${encodeURIComponent(videoId)}&kind=audio`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok || !j.url) throw new Error(j?.error || `stream resolve failed (${r.status})`);
  const info: ResolvedAudioStream = {
    url: j.url,
    expireAt: j.expireAt ?? Date.now() + 3_600_000,
    durationSeconds: j.durationSeconds ?? null,
  };
  audioCache.set(videoId, info);
  return info;
}

export async function resolveVideoStream(videoId: string): Promise<ResolvedVideoStream> {
  const hit = fresh(videoCache.get(videoId));
  if (hit) return hit;
  const r = await fetch(`/.netlify/functions/innertube?id=${encodeURIComponent(videoId)}&kind=video`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok || !j.url) throw new Error(j?.error || `video resolve failed (${r.status})`);
  const info: ResolvedVideoStream = {
    url: j.url,
    expireAt: j.expireAt ?? Date.now() + 3_600_000,
    width: j.width ?? null,
    height: j.height ?? null,
  };
  videoCache.set(videoId, info);
  return info;
}

/** Drop a cached stream after a mid-play failure (expired/403) so the next resolve is fresh. */
export function invalidateAudioStream(videoId: string): void {
  audioCache.delete(videoId);
}

export function invalidateVideoStream(videoId: string): void {
  videoCache.delete(videoId);
}

/* ------------------------------------------------------------------ */
/*  Same-origin YouTube keyword search (Search screen)                 */
/* ------------------------------------------------------------------ */

export interface RemoteSearchItem {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number | null;
  thumbnail: string;
  /** video = song result, playlist = YouTube playlist result. */
  kind?: "video" | "playlist";
  playlistId?: string;
  videoCount?: number;
}

/**
 * Keyword-search YouTube through our same-origin function (server-side
 * Innertube — no CORS, no API key). Throws when the endpoint fails so
 * callers can fall back to public instances.
 */
export async function searchRemote(query: string, limit = 10): Promise<RemoteSearchItem[]> {
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(
      `/.netlify/functions/innertube?kind=search&q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: ctrl.signal }
    );
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok || !Array.isArray(j.items)) throw new Error(j?.error || `search failed (${r.status})`);
    return j.items as RemoteSearchItem[];
  } finally {
    window.clearTimeout(to);
  }
}
