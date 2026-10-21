/**
 * Innertube keyword search — powers the Search screen ("search YouTube by
 * keywords"). Runs server-side in the Netlify function (production) and the
 * Vite dev middleware (local `npm run dev`), so the browser never talks to
 * YouTube directly (no CORS, no API key).
 */

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface InnertubeSearchItem {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number | null;
  thumbnail: string;
  /** video = regular result, playlist = YouTube playlist result. */
  kind?: "video" | "playlist";
  playlistId?: string;
  videoCount?: number;
}

export type InnertubeSearchResult =
  | { ok: true; items: InnertubeSearchItem[] }
  | { ok: false; error: string; status: number };

const TIME_RE = /^\d{1,2}(:\d{2}){1,2}$/;

/** "1:02:03" / "12:34" → seconds; anything unparsable → null. */
function durationToSeconds(text: string): number | null {
  const parts = text.trim().split(":").map((p) => Number(p));
  if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function runsText(node: any): string {
  if (!node) return "";
  if (typeof node.simpleText === "string") return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r: any) => r?.text ?? "").join("");
  if (typeof node.content === "string") return node.content;
  return "";
}

function parseVideoRenderer(v: any): InnertubeSearchItem | null {
  const videoId: string = v?.videoId ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const title = runsText(v.title).slice(0, 120);
  if (!title) return null;
  const author = (runsText(v.ownerText) || runsText(v.shortBylineText) || "YouTube").slice(0, 48);
  const durText = runsText(v.lengthText);
  const thumbs: any[] = v.thumbnail?.thumbnails ?? [];
  return {
    videoId,
    title,
    author,
    durationSeconds: durText ? durationToSeconds(durText) : null,
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1]?.url ?? "" : "",
  };
}

/** Newer YouTube search responses surface videos as lockupViewModel instead of videoRenderer. */
function parseLockup(l: any): InnertubeSearchItem | null {
  const videoId: string = l?.contentId ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  const meta = l?.metadata?.lockupMetadataViewModel;
  const title = String(meta?.title?.content ?? "").slice(0, 120);
  if (!title) return null;

  const pieces: any[] = meta?.metadata?.contentMetadataViewModel?.pieces ?? [];
  const texts: string[] = [];
  for (const p of pieces) {
    const t = p?.text?.content;
    if (typeof t === "string" && t.trim()) texts.push(t.trim());
  }
  const durText = texts.find((t) => TIME_RE.test(t)) ?? "";
  const author = (texts.find((t) => !TIME_RE.test(t) && t !== "•" && t !== "-") || "YouTube").slice(0, 48);

  const sources: any[] = l?.thumbnail?.thumbnailViewModel?.image?.sources ?? [];

  return {
    videoId,
    title,
    author,
    durationSeconds: durText ? durationToSeconds(durText) : null,
    thumbnail: sources.length ? sources[sources.length - 1]?.url ?? "" : "",
  };
}

function videoCountFrom(text: string): number | undefined {
  const n = parseInt(text.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parsePlaylistRenderer(p: any): InnertubeSearchItem | null {
  const playlistId: string = p?.playlistId ?? "";
  if (!/^[A-Za-z0-9_-]{12,}$/.test(playlistId)) return null;
  const title = runsText(p.title).slice(0, 120);
  if (!title) return null;
  const author = (
    runsText(p.ownerText) ||
    runsText(p.longBylineText) ||
    runsText(p.shortBylineText) ||
    "YouTube"
  ).slice(0, 48);
  const thumbs: any[] = p.thumbnail?.thumbnails ?? [];
  const countText = runsText(p.videoCountText) || runsText(p.videoCount);
  return {
    videoId: "",
    title,
    author,
    durationSeconds: null,
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1]?.url ?? "" : "",
    kind: "playlist",
    playlistId,
    videoCount: countText ? videoCountFrom(countText) : undefined,
  };
}

/** Lockup entries that are NOT 11-char videos are playlist lockups. */
function parseLockupPlaylist(l: any): InnertubeSearchItem | null {
  const playlistId = String(l?.contentId ?? "");
  if (/^[A-Za-z0-9_-]{11}$/.test(playlistId)) return null;
  if (!/^[A-Za-z0-9_-]{12,}$/.test(playlistId)) return null;

  const meta = l?.metadata?.lockupMetadataViewModel;
  const title = String(meta?.title?.content ?? "").slice(0, 120);
  if (!title) return null;

  const pieces: any[] = meta?.metadata?.contentMetadataViewModel?.pieces ?? [];
  const texts: string[] = [];
  for (const p of pieces) {
    const t = p?.text?.content;
    if (typeof t === "string" && t.trim()) texts.push(t.trim());
  }
  const countText = texts.find((t) => /video/i.test(t)) ?? "";
  const author = (texts.find((t) => !/video/i.test(t) && t !== "•" && t !== "-") || "YouTube").slice(0, 48);

  const sources: any[] = l?.thumbnail?.thumbnailViewModel?.image?.sources ?? [];

  return {
    videoId: "",
    title,
    author,
    durationSeconds: null,
    thumbnail: sources.length ? sources[sources.length - 1]?.url ?? "" : "",
    kind: "playlist",
    playlistId,
    videoCount: countText ? videoCountFrom(countText) : undefined,
  };
}

/** Depth-limited walk collecting every video AND playlist result in the response. */
function collectItems(node: any, out: Map<string, InnertubeSearchItem>, depth = 0): void {
  if (!node || typeof node !== "object" || depth > 16 || out.size > 80) return;
  if (Array.isArray(node)) {
    for (const el of node) collectItems(el, out, depth + 1);
    return;
  }
  if (node.videoRenderer) {
    const item = parseVideoRenderer(node.videoRenderer);
    if (item && !out.has(item.videoId)) out.set(item.videoId, item);
  }
  if (node.playlistRenderer) {
    const item = parsePlaylistRenderer(node.playlistRenderer);
    if (item && item.playlistId && !out.has(`pl:${item.playlistId}`)) out.set(`pl:${item.playlistId}`, item);
  }
  if (node.lockupViewModel) {
    const asVideo = parseLockup(node.lockupViewModel);
    const asPlaylist = asVideo ? null : parseLockupPlaylist(node.lockupViewModel);
    const item = asVideo ?? asPlaylist;
    if (item) {
      const key = item.kind === "playlist" ? `pl:${item.playlistId}` : item.videoId;
      if (key && !out.has(key)) out.set(key, item);
    }
  }
  for (const key of Object.keys(node)) {
    if (key === "videoRenderer" || key === "playlistRenderer" || key === "lockupViewModel") continue;
    collectItems(node[key], out, depth + 1);
  }
}

export async function searchInnertube(query: string, limit = 10): Promise<InnertubeSearchResult> {
  const q = query.trim().slice(0, 200);
  if (!q) return { ok: false, error: "empty query", status: 400 };
  const wanted = Math.max(1, Math.min(25, limit));

  const body = JSON.stringify({
    query: q,
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20250601.00.00",
        hl: "en",
        gl: "US",
      },
    },
  });

  let j: any;
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": WEB_UA },
      body,
    });
    if (!r.ok) return { ok: false, error: `upstream ${r.status}`, status: 502 };
    j = await r.json();
  } catch {
    return { ok: false, error: "upstream unreachable", status: 502 };
  }

  const found = new Map<string, InnertubeSearchItem>();
  collectItems(j, found);
  const all = [...found.values()];
  const videos = all
    .filter((it) => it.kind !== "playlist")
    // Drop obvious shorts/noise: known sub-minute clips.
    .filter((it) => it.durationSeconds === null || it.durationSeconds >= 45)
    .slice(0, wanted);
  const playlists = all.filter((it) => it.kind === "playlist").slice(0, 6);

  // Videos first (primary results), playlists appended after them.
  return { ok: true, items: [...videos, ...playlists] };
}
