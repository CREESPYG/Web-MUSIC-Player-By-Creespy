import type { Track } from "./media";
import { resolvePlayableSource } from "./resolver";

export interface SoundCloudTrackInfo {
  title: string;
  artist: string;
  cover?: string;
  duration?: number;
  sourceUrl: string;
  sourceTrackId?: string;
}

/** Detect soundcloud.com track/playlist/set URLs. */
export function isSoundCloudUrl(input: string): boolean {
  try {
    const url = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
    return url.hostname === "soundcloud.com" || url.hostname.endsWith(".soundcloud.com");
  } catch {
    return false;
  }
}

/**
 * SoundCloud URLs are /:user/:title for tracks and /:user/sets/:name for playlists.
 * Full playlist import needs the SoundCloud v2 API key (501 for its relay), so only
 * single-track URLs are importable keyless — via the public CORS-open oEmbed endpoint.
 */
export function parseSoundCloudUrl(
  input: string
): { type: "track" | "set" | "unknown"; sourceUrl: string } | null {
  try {
    const raw = input.trim();
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const segs = url.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return null;
    const isSet = segs.length >= 3 || segs.includes("sets");
    return { type: isSet ? "set" : "track", sourceUrl: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}

function splitScTitle(title: string, defaultAuthor: string): { title: string; artist: string } {
  const m = title.match(/^(.*?)\s+by\s+(.+)$/);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };
  return { title, artist: defaultAuthor };
}

/** Loads a single SoundCloud track via the public oEmbed endpoint. */
export async function loadSoundCloudTrack(
  input: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<SoundCloudTrackInfo> {
  const parsed = parseSoundCloudUrl(input);
  if (!parsed) throw new Error("Invalid SoundCloud link.");
  if (parsed.type !== "track") {
    throw new Error(
      "SoundCloud playlists/sets import needs SoundCloud's official API key — paste the track links instead (one per line)."
    );
  }

  onProgress?.(0, 1);
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 7000);
  let j: any = null;
  try {
    const res = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(parsed.sourceUrl)}`,
      { signal: ctrl.signal }
    );
    if (res.ok) j = await res.json();
  } catch {
    /* fallback */
  } finally {
    window.clearTimeout(to);
  }
  if (!j || !j.title) throw new Error("Could not load SoundCloud track (deleted or private?).");
  onProgress?.(1, 1);

  const { title, artist } = splitScTitle(String(j.title || ""), String(j.author_name || "SoundCloud"));

  return {
    title,
    artist,
    cover: j.thumbnail_url || undefined,
    duration: typeof j.duration === "number" ? Math.round(j.duration) : undefined,
    sourceUrl: parsed.sourceUrl,
  };
}

/**
 * Converts a SoundCloud track to a normalized CREESPY Track. If no legitimate
 * playable source exists the track is kept with resolverStatus = "UNRESOLVED"
 * and playable = false (never a fabricated/half-broken video id).
 */
export async function convertSoundCloudTrackToPlayerTrack(
  info: SoundCloudTrackInfo,
  playlistTitle: string
): Promise<Track> {
  const title = String(info.title || "Untitled SoundCloud Track").trim();
  const artist = String(info.artist || "Unknown Artist").trim();
  const artists = artist
    .split(/[,;&]/)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 8);

  const resolved = await resolvePlayableSource({
    title,
    artist,
    artists,
    album: playlistTitle,
    duration: info.duration,
    sourceTrackId: info.sourceTrackId,
  });

  const videoId = resolved.videoId || "";
  const art = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : info.cover;

  return {
    id: `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    videoId,
    title,
    artist,
    artists,
    album: playlistTitle,
    duration: info.duration,
    thumb: art,
    artwork: art,
    coverUrl: art,
    sourceType: "soundcloud",
    sourcePlatform: "soundcloud",
    sourceUrl: info.sourceUrl,
    sourceTrackId: info.sourceTrackId,
    source: "custom",
    tag: "SoundCloud",
    playlistPosition: 1,
    seed: 1,
    addedAt: Date.now(),
    metadataConfidence: resolved.metadataConfidence,
    playable: Boolean(videoId),
    playableSource: videoId || undefined,
    playableSourceType: resolved.playableSourceType,
    resolverStatus: resolved.status,
  };
}