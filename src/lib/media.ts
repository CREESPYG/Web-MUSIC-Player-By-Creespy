import type { Track, TrackSourceType } from "./trackModel";
export type { Track, TrackSourceType };

/* ------------------------------------------------------------------ */
/*  Link parsing                                                      */
/* ------------------------------------------------------------------ */

/** Accepts full URLs (watch, youtu.be, shorts, embed, music) or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const q = url.searchParams.get("v");
      if (q && /^[a-zA-Z0-9_-]{11}$/.test(q)) return q;
      const m = url.pathname.match(/\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

/** Extracts a playlist ID from URLs like .../playlist?list=PLxxx or ...watch?v=yyy&list=PLxxx */
export function parsePlaylistId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // Bare playlist ID
  if (/^(PL|UU|LL|RD|OLAK5uy_)[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const list = url.searchParams.get("list");
    if (list && /^[a-zA-Z0-9_-]{10,}$/.test(list)) return list;
  } catch {
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Metadata extraction via oEmbed + noembed fallback                 */
/* ------------------------------------------------------------------ */

export interface TrackMeta {
  title: string;
  artist: string;
  duration?: number;
}

export async function fetchTrackMeta(videoId: string): Promise<TrackMeta> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (r.ok) {
      const j = await r.json();
      return splitArtistTitle(j.title || "Unknown title", j.author_name || "YouTube");
    }
  } catch {
    /* fallback */
  }

  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (r.ok) {
      const j = await r.json();
      if (j.title) return splitArtistTitle(j.title, j.author_name || "YouTube");
    }
  } catch {
    /* fallback */
  }

  return { title: `Track ${videoId.slice(0, 6)}`, artist: "YouTube" };
}

function splitArtistTitle(rawTitle: string, defaultAuthor: string): TrackMeta {
  const clean = rawTitle
    .replace(/\[.*?\]|\(.*?\)/g, (m) => (/official|video|audio|lyrics|hd|4k|mv|remix/i.test(m) ? "" : m))
    .replace(/\s{2,}/g, " ")
    .trim();

  const m = clean.match(/^(.+?)\s*[-–—:]\s*(.+)$/);
  if (m && m[1].length < 40 && m[2].length > 1) {
    return { artist: m[1].trim(), title: m[2].trim() };
  }
  return { artist: defaultAuthor.replace(/\s*-\s*topic$/i, "").trim() || "YouTube", title: clean };
}

/* ------------------------------------------------------------------ */
/*  Local track construction + storage                                */
/* ------------------------------------------------------------------ */

export function makeTrack(
  videoId: string,
  title: string,
  artist: string,
  tag = "Custom",
  source: "seed" | "custom" | "similar" = "custom",
  duration?: number
): Track {
  let hash = 0;
  for (let i = 0; i < videoId.length; i++) hash = (hash << 5) - hash + videoId.charCodeAt(i);
  const bpm = 82 + (Math.abs(hash) % 48);
  const seed = Math.abs(hash) % 1000;

  return {
    id: `custom-${videoId}`,
    videoId,
    title,
    artist,
    tag,
    thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    bpm,
    seed,
    custom: true,
    source,
    sourceType: "youtube",
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    duration,
  };
}

export const CUSTOM_STORAGE_KEY = "creespy-user-tracks-v1";

export function loadCustomTracks(): Track[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveCustomTracks(tracks: Track[]): void {
  try {
    const customOnly = tracks.filter((t) => t.source === "custom" || t.custom);
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customOnly.slice(0, 100)));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Tokenization & similarity calculation                             */
/* ------------------------------------------------------------------ */

const STOP = new Set([
  "the", "and", "feat", "ft", "prod", "remix", "version", "original", "audio",
  "official", "video", "lyrics", "with", "edit", "mix", "extended", "club", "radio", "music",
]);

export function tokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** 0..1 — how musically close two tracks feel (shared artists, scene, mood words). */
export function similarity(a: Track, b: Track): number {
  if (a.id === b.id) return 1;
  const at = new Set([...tokens(a.title || ""), ...tokens(a.artist || ""), ...tokens(a.tag || "")]);
  const bt = [...tokens(b.title || ""), ...tokens(b.artist || ""), ...tokens(b.tag || "")];
  if (!at.size || !bt.length) return 0.15;
  let hit = 0;
  bt.forEach((t) => {
    if (at.has(t)) hit++;
  });
  const overlap = (hit / Math.max(6, new Set([...at, ...bt]).size)) * 2.1;
  const artistBonus =
    a.artist && b.artist && a.artist.toLowerCase() === b.artist.toLowerCase() ? 0.42 : 0;
  const aBpm = typeof a.bpm === "number" ? a.bpm : 96;
  const bBpm = typeof b.bpm === "number" ? b.bpm : 96;
  const bpmCloseness = 1 - Math.min(1, Math.abs(aBpm - bBpm) / 70);
  return Math.min(1, overlap * 0.62 + artistBonus + bpmCloseness * 0.22);
}

/**
 * Magic shuffle: weighted pick favouring tracks close to what's playing,
 * strongly penalising anything heard recently, with a little chaos.
 */
export function pickMagicIndex(tracks: Track[], current: number, recent: string[]): number {
  if (tracks.length <= 1) return 0;
  const cur = tracks[current];
  const recentSet = new Set(recent.slice(-Math.min(6, tracks.length - 1)));
  const weights = tracks.map((t, i) => {
    if (i === current) return 0;
    let w = 0.12 + Math.pow(similarity(cur, t), 1.5) * 1.5;
    if (recentSet.has(t.id)) w *= 0.04;
    if (t.source === "similar") w *= 1.25;
    return w * (0.7 + Math.random() * 0.6);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) {
    let i = Math.floor(Math.random() * tracks.length);
    if (i === current) i = (i + 1) % tracks.length;
    return i;
  }
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/* ------------------------------------------------------------------ */
/*  Similar-song discovery (keyless, multi-instance, fails soft)       */
/* ------------------------------------------------------------------ */

const ENDPOINTS = [
  { url: (id: string) => `https://pipedapi.kavin.rocks/streams/${id}`, kind: "piped" as const },
  { url: (id: string) => `https://pipedapi.adminforge.de/streams/${id}`, kind: "piped" as const },
  { url: (id: string) => `https://api.piped.private.coffee/streams/${id}`, kind: "piped" as const },
  { url: (id: string) => `https://pipedapi.reallyaweso.me/streams/${id}`, kind: "piped" as const },
  { url: (id: string) => `https://inv.nadeko.net/api/v1/videos/${id}`, kind: "invidious" as const },
  { url: (id: string) => `https://invidious.f5.si/api/v1/videos/${id}`, kind: "invidious" as const },
  { url: (id: string) => `https://yewtu.be/api/v1/videos/${id}`, kind: "invidious" as const },
];

export interface SimilarResult {
  tracks: Track[];
  live: boolean;
}

const SEARCH_ENDPOINTS = [
  { url: (q: string) => `https://pipedapi.kavin.rocks/search?q=${q}&filter=videos`, kind: "piped" as const },
  { url: (q: string) => `https://pipedapi.adminforge.de/search?q=${q}&filter=videos`, kind: "piped" as const },
  { url: (q: string) => `https://pipedapi.reallyaweso.me/search?q=${q}&filter=videos`, kind: "piped" as const },
  { url: (q: string) => `https://inv.nadeko.net/api/v1/search?q=${q}&type=video`, kind: "invidious" as const },
  { url: (q: string) => `https://yewtu.be/api/v1/search?q=${q}&type=video`, kind: "invidious" as const },
];

function normalize(items: any[], kind: "piped" | "invidious", known: Set<string>, tag: string, limit: number): Track[] {
  const out: Track[] = [];
  for (const s of items) {
    const vid: string | null =
      kind === "piped"
        ? s.url
          ? parseYouTubeId(`https://youtube.com${s.url.startsWith("http") ? new URL(s.url).pathname : s.url}`) ?? parseYouTubeId(s.url)
          : null
        : s.videoId;
    if (!vid || known.has(vid)) continue;
    const dur = kind === "piped" ? s.duration : s.lengthSeconds;
    if (typeof dur === "number" && (dur < 120 || dur > 21600)) continue;
    const title = String(s.title || "").slice(0, 80);
    if (!title) continue;
    const artist = String((kind === "piped" ? s.uploaderName : s.author) || "YouTube")
      .replace(/^.*-\s*/, "")
      .replace(/^.*@/, "")
      .slice(0, 36);
    known.add(vid);
    out.push(makeTrack(vid, title, artist, tag, "similar", typeof dur === "number" ? dur : undefined));
    if (out.length >= limit) break;
  }
  return out;
}

/** Builds a YouTube search query from a track's mood/artist tokens. */
function queryFor(seed: Track): string {
  const words = [...tokens(seed.artist || ""), ...tokens(seed.title || ""), ...tokens(seed.tag || "")];
  const uniq = Array.from(new Set(words)).slice(0, 4);
  const base = uniq.length ? uniq.join(" ") : seed.artist || "trending";
  return `${base} songs mix`;
}

// Circuit breaker: track failed endpoints so we don't spam blocked/dead servers repeatedly
const endpointFailures = new Map<string, number>();
const FAIL_COOLDOWN_MS = 300_000; // 5 minutes cooldown before retrying a failed host

function isEndpointHealthy(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname;
    const lastFail = endpointFailures.get(host) || 0;
    return Date.now() - lastFail > FAIL_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markEndpointFailed(urlStr: string): void {
  try {
    const host = new URL(urlStr).hostname;
    endpointFailures.set(host, Date.now());
  } catch {
    /* noop */
  }
}

/** Searches YouTube via public keyless endpoints with fast failure */
export async function searchYouTube(query: string, limit = 10): Promise<Track[]> {
  const q = encodeURIComponent(query.trim());
  const known = new Set<string>();

  // Filter to healthy endpoints first
  const candidates = SEARCH_ENDPOINTS.filter((ep) => isEndpointHealthy(ep.url(q))).slice(0, 3);
  if (!candidates.length) candidates.push(SEARCH_ENDPOINTS[0]);

  for (const ep of candidates) {
    try {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), 3200);
      const res = await fetch(ep.url(q), { signal: ctrl.signal });
      window.clearTimeout(to);
      if (!res.ok) {
        markEndpointFailed(ep.url(q));
        continue;
      }
      const j = await res.json();
      const items: any[] = ep.kind === "piped" ? j?.items || [] : Array.isArray(j) ? j : j?.items || [];
      const out = normalize(items, ep.kind, known, "Search result", limit);
      if (out.length) return out;
    } catch {
      markEndpointFailed(ep.url(q));
    }
  }
  return [];
}

/**
 * Magic-shuffle discovery: searches YouTube directly (via keyless public
 * instances) with endpoint circuit-breaker, preventing hanging network loops.
 */
export async function fetchSimilar(
  seedId: string,
  knownIds: Set<string>,
  limit = 4,
  seed?: Track
): Promise<SimilarResult> {
  const known = new Set(knownIds);

  // 1) direct YouTube search based on the current track (try max 2 healthy endpoints)
  if (seed) {
    const q = encodeURIComponent(queryFor(seed));
    const searchCandidates = SEARCH_ENDPOINTS.filter((ep) => isEndpointHealthy(ep.url(q))).slice(0, 2);

    for (const ep of searchCandidates) {
      try {
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 3200);
        const res = await fetch(ep.url(q), { signal: ctrl.signal });
        window.clearTimeout(to);
        if (!res.ok) {
          markEndpointFailed(ep.url(q));
          continue;
        }
        const j = await res.json();
        const items: any[] = ep.kind === "piped" ? j?.items || [] : Array.isArray(j) ? j : j?.items || [];
        const out = normalize(items, ep.kind, known, "Magic · from YouTube", limit);
        if (out.length) return { tracks: out, live: true };
      } catch {
        markEndpointFailed(ep.url(q));
      }
    }
  }

  // 2) related-streams fallback (try max 2 healthy endpoints)
  const streamCandidates = ENDPOINTS.filter((ep) => isEndpointHealthy(ep.url(seedId))).slice(0, 2);
  for (const ep of streamCandidates) {
    try {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), 3200);
      const res = await fetch(ep.url(seedId), { signal: ctrl.signal });
      window.clearTimeout(to);
      if (!res.ok) {
        markEndpointFailed(ep.url(seedId));
        continue;
      }
      const j = await res.json();
      const items: any[] =
        ep.kind === "piped"
          ? (j?.relatedStreams || []).filter((s: any) => s?.type === "stream" || s?.url)
          : j?.recommendedVideos || [];
      const out = normalize(items, ep.kind, known, "Magic · auto-discovered", limit);
      if (out.length) return { tracks: out, live: true };
    } catch {
      markEndpointFailed(ep.url(seedId));
    }
  }
  return { tracks: [], live: false };
}
