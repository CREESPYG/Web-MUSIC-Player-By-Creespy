import type { Track } from "./media";
import { matchTrackToYouTube } from "./spotify";

export interface JioSaavnTrackItem {
  title: string;
  artist: string;
  album?: string;
  image?: string;
  duration?: number;
  sourceUrl?: string;
}

export interface JioSaavnImportResult {
  kind: "song" | "album" | "playlist";
  title: string;
  cover?: string;
  items: JioSaavnTrackItem[];
}

/** Detect JioSaavn song/album/playlist URLs (www / m. subdomains). */
export function isJioSaavnUrl(input: string): boolean {
  try {
    const url = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
    return url.hostname === "jiosaavn.com" || url.hostname.endsWith(".jiosaavn.com");
  } catch {
    return false;
  }
}

/**
 * Extracts the resource token (last URL segment) + a kind hint from the path:
 *   /song/.../{token}      → song
 *   /album/.../{token}     → album
 *   /featured|mixtape|playlist/.../{token} → playlist
 */
export function parseJioSaavnUrl(
  input: string
): { token: string; kindHint: "song" | "album" | "playlist" | null; sourceUrl: string } | null {
  try {
    const raw = input.trim();
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const segs = url.pathname.split("/").filter(Boolean);
    if (!segs.length) return null;
    const token = decodeURIComponent(segs[segs.length - 1]);
    if (!token) return null;

    let kindHint: "song" | "album" | "playlist" | null = null;
    const first = segs[0];
    if (first === "song") kindHint = "song";
    else if (first === "album") kindHint = "album";
    else if (first === "featured" || first === "mixtape" || first === "playlist") kindHint = "playlist";

    return { token, kindHint, sourceUrl: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}

const PAGE_SIZE = 100;
const MAX_PAGES = 200;

async function webapiGet(token: string, type: string, page: number, n: number): Promise<any | null> {
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(
      `/api/jiosaavn/api.php?__call=webapi.get&token=${encodeURIComponent(token)}&type=${type}&p=${page}&n=${n}&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`,
      { signal: ctrl.signal }
    );
    if (!res.ok) {
      const fb = await fetch(
        `https://api.allorigins.win/get?url=${encodeURIComponent(
          `https://www.jiosaavn.com/api.php?__call=webapi.get&token=${encodeURIComponent(token)}&type=${type}&p=${page}&n=${n}&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`
        )}`,
        { signal: ctrl.signal }
      );
      if (fb.ok) {
        const wrapped = await fb.json();
        if (typeof wrapped.contents === "string") return JSON.parse(wrapped.contents);
      }
      return null;
    }
    return await res.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(to);
  }
}

function itemFromSongObj(o: any): JioSaavnTrackItem {
  const subtitle = String(o?.subtitle || "");
  const parts = subtitle
    .split(/\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const artistField = parts[0] || o?.more_info?.artists || o?.more_info?.singers || "";
  const albumField = parts[1] || o?.more_info?.album || undefined;

  return {
    title: String(o?.title || o?.song || "Untitled JioSaavn Track").trim(),
    artist: String(artistField)
      .split(",")[0]
      ?.trim() || "JioSaavn Artist",
    album: albumField ? String(albumField).trim() : undefined,
    image: o?.image ? String(o.image).replace(/150x150\.jpg$/, "500x500.jpg") : undefined,
    duration: typeof o?.more_info?.duration === "number" ? o.more_info.duration : undefined,
    sourceUrl: o?.perma_url ? String(o.perma_url) : undefined,
  };
}

/**
 * Loads a JioSaavn song/album/playlist by its URL token.
 * Uses JioSaavn's keyless `webapi.get` resolver which returns full track lists,
 * with real page-based pagination (100/page until the item is exhausted).
 */
export async function loadJioSaavnResource(
  input: string,
  onProgress?: (done: number, total?: number) => void
): Promise<JioSaavnImportResult> {
  const parsed = parseJioSaavnUrl(input);
  if (!parsed) throw new Error("Invalid JioSaavn link.");

  const candidates: ("song" | "album" | "playlist")[] = parsed.kindHint
    ? [parsed.kindHint, ...(["song", "album", "playlist"] as const).filter((t) => t !== parsed.kindHint)]
    : (["song", "album", "playlist"] as const);

  let kind: "song" | "album" | "playlist" | null = null;
  let probed: any = null;
  for (const t of candidates) {
    const probe = await webapiGet(parsed.token, t, 1, 1);
    if (probe && (Array.isArray(probe.songs) || Array.isArray(probe.list))) {
      const firstItem = probe.list?.[0] || probe.songs?.[0];
      const isTrailer = firstItem && /sample\s+trailer/i.test(String(firstItem.title || ""));
      if (isTrailer) continue;
      kind = t;
      probed = probe;
      break;
    }
  }
  if (!kind) throw new Error("Could not find that JioSaavn item (may be geo-restricted or removed).");

  const items: JioSaavnTrackItem[] = [];
  const seen = new Set<string>();

  if (kind === "song") {
    for (const s of Array.isArray(probed.songs) ? probed.songs : []) {
      items.push(itemFromSongObj(s));
    }
  } else {
    for (let page = 1; page <= MAX_PAGES; page++) {
      onProgress?.(items.length);
      const pageData = await webapiGet(parsed.token, kind, page, PAGE_SIZE);
      if (!pageData) break;
      const list: any[] = Array.isArray(pageData.list) ? pageData.list : [];
      let added = 0;
      for (const o of list) {
        const perma = String(o?.perma_url || "");
        if (perma) {
          if (seen.has(perma)) continue;
          seen.add(perma);
        }
        items.push(itemFromSongObj(o));
        added++;
      }
      if (!list.length || added < PAGE_SIZE) break;
    }
  }

  if (!items.length) throw new Error("No tracks found in that JioSaavn item.");

  return {
    kind,
    title:
      kind === "song"
        ? items[0].title
        : String(
            probed?.title ||
              (kind === "album" ? items[0].album : undefined) ||
              kind
          ),
    cover: items[0].image,
    items,
  };
}

/** Resolves JioSaavn tracks to playable YouTube-backed Track objects. */
export async function convertJioSaavnTracksToPlayerTracks(
  result: JioSaavnImportResult,
  playlistTitle: string,
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const out: Track[] = [];
  for (let i = 0; i < result.items.length; i++) {
    onProgress?.(i, result.items.length);
    const it = result.items[i];
    let videoId: string | null = null;
    try {
      videoId = await matchTrackToYouTube(it.title, it.artist);
    } catch {
      /* fallback */
    }
    const vid = videoId || `js_${encodeURIComponent(it.title).slice(0, 7)}_${Date.now().toString(36)}${i}`;

    out.push({
      id: `js-${Date.now()}-${i}`,
      videoId: vid,
      title: it.title,
      artist: it.artist,
      album: it.album || playlistTitle,
      duration: it.duration || 180,
      thumb: it.image || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      artwork: it.image,
      coverUrl: it.image,
      sourceType: "jiosaavn",
      sourceUrl: it.sourceUrl,
      source: "custom",
      tag: "JioSaavn",
      bpm: 100,
      seed: 1,
      addedAt: Date.now(),
    });
  }
  return out;
}