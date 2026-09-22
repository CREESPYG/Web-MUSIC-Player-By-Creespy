import type { Track } from "./media";
import { resolvePlayableSource, matchTrackToYouTube } from "./resolver";

export { matchTrackToYouTube };

export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  duration?: number;
  cover?: string;
  previewUrl?: string;
  spotifyUri?: string;
}

export interface SpotifyPlaylistResult {
  title: string;
  cover?: string;
  type: "playlist" | "album" | "track";
  tracks: SpotifyTrackInfo[];
}

/**
 * Checks if a string is a Spotify URL or URI.
 */
export function isSpotifyUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.includes("spotify.com/playlist/") ||
    trimmed.includes("spotify.com/album/") ||
    trimmed.includes("spotify.com/track/") ||
    trimmed.startsWith("spotify:playlist:") ||
    trimmed.startsWith("spotify:album:") ||
    trimmed.startsWith("spotify:track:")
  );
}

/**
 * Parses Spotify playlist, album, or track ID.
 */
export function parseSpotifyUrl(
  input: string
): { type: "playlist" | "album" | "track"; id: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // URI format: spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
  const uriMatch = trimmed.match(/^spotify:(playlist|album|track):([a-zA-Z0-9]+)/);
  if (uriMatch) {
    return { type: uriMatch[1] as any, id: uriMatch[2] };
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const pathname = url.pathname;
    const match = pathname.match(/\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
    if (match) {
      return { type: match[1] as any, id: match[2] };
    }
  } catch {
    /* fallback */
  }

  return null;
}

/**
 * Extracts metadata and tracks from a Spotify playlist or album URL.
 */
export async function loadSpotifyData(
  input: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<SpotifyPlaylistResult> {
  const parsed = parseSpotifyUrl(input);
  if (!parsed) {
    throw new Error("Invalid Spotify link. Please paste a playlist, album, or track URL.");
  }

  const { type, id } = parsed;

  // Try endpoints to fetch the Spotify embed HTML
  const endpoints = [
    `/api/spotify-embed/${type}/${id}`,
    `https://corsproxy.io/?url=${encodeURIComponent(`https://open.spotify.com/embed/${type}/${id}`)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(`https://open.spotify.com/embed/${type}/${id}`)}`,
  ];

  let rawHtml = "";

  for (const ep of endpoints) {
    try {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(ep, { signal: ctrl.signal });
      window.clearTimeout(to);
      if (!res.ok) continue;

      if (ep.includes("allorigins")) {
        const j = await res.json();
        rawHtml = j.contents || "";
      } else {
        rawHtml = await res.text();
      }

      if (rawHtml && (rawHtml.includes("__NEXT_DATA__") || rawHtml.includes("Spotify.Entity"))) {
        break;
      }
    } catch {
      /* continue to next fallback */
    }
  }

  if (!rawHtml) {
    // Try oEmbed as minimal fallback for single tracks
    try {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${type}/${id}`)}`,
        { signal: ctrl.signal }
      );
      window.clearTimeout(to);
      if (r.ok) {
        const j = await r.json();
        return {
          title: j.title || "Spotify Track",
          cover: j.thumbnail_url,
          type,
          tracks: [
            {
              title: j.title || "Spotify Track",
              artist: j.author_name || "Spotify Artist",
              cover: j.thumbnail_url,
            },
          ],
        };
      }
    } catch {
      /* continue */
    }

    throw new Error("Could not load Spotify playlist data. Please ensure the playlist is public.");
  }

  // Parse HTML
  let entity: any = null;
  const match = rawHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      entity = data.props?.pageProps?.state?.data?.entity;
    } catch {
      /* fallback */
    }
  }

  if (!entity) {
    throw new Error("Could not parse Spotify playlist structure.");
  }

  const playlistTitle = String(entity.name || entity.title || "Spotify Collection").trim();
  const coverUrl =
    entity.coverArt?.sources?.[0]?.url ||
    entity.visualIdentity?.image?.[0]?.url ||
    undefined;

  const rawTracks: any[] = Array.isArray(entity.trackList)
    ? entity.trackList
    : entity.type === "track"
    ? [entity]
    : [];

  const total = rawTracks.length;
  onProgress?.(0, total);

  const tracks: SpotifyTrackInfo[] = [];

  for (let i = 0; i < rawTracks.length; i++) {
    const t = rawTracks[i];
    const trackTitle = String(t.title || t.name || `Track ${i + 1}`).trim();
    const artist = String(
      t.subtitle ||
        (Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(", ") : "") ||
        "Spotify Artist"
    ).trim();
    const duration =
      typeof t.duration === "number" ? Math.round(t.duration / 1000) : 180;
    const previewUrl = t.audioPreview?.url || undefined;

    tracks.push({
      title: trackTitle,
      artist,
      duration,
      cover: coverUrl,
      previewUrl,
      spotifyUri: t.uri,
    });

    onProgress?.(i + 1, total);
  }

  return {
    title: playlistTitle,
    cover: coverUrl,
    type,
    tracks,
  };
}

/** Splits a "ArtistA x ArtistB, ArtistC, ..." string into explicit artists[]. */
function splitArtists(artist: string): string[] {
  return artist
    .split(/[,;&/]/)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** Derives the Spotify track ID from a spotify:track:URI or null. */
function spotifyTrackId(uri?: string): string | undefined {
  const m = String(uri || "").match(/^spotify:track:([a-zA-Z0-9]+)/);
  return m ? m[1] : undefined;
}

/**
 * Loads Spotify playlist/album/track metadata and converts EVERY source track
 * into a normalized CREESPY Track — resolving a playable YouTube source where
 * possible. Tracks that cannot be resolved on YouTube are KEPT in the playlist
 * with resolverStatus = "UNRESOLVED" and playable = false (the original
 * playlist identity of every track is preserved).
 */
export async function convertSpotifyTracksToPlayerTracks(
  spotifyTracks: SpotifyTrackInfo[],
  playlistTitle: string,
  onResolveProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean
): Promise<Track[]> {
  const total = spotifyTracks.length;
  if (total === 0) {
    onResolveProgress?.(0, 0);
    return [];
  }
  onResolveProgress?.(0, total);

  // One slot per index preserves ORIGINAL playlist order and keeps every track.
  const slots: (Track | null)[] = new Array<Track | null>(total).fill(null);
  const batchStamp = Date.now().toString(36);

  let next = 0;
  let doneCount = 0;

  async function worker(): Promise<void> {
    while (next < total) {
      if (isCancelled?.()) return;
      const i = next++;
      slots[i] = await buildSpotifyTrack(spotifyTracks[i], i, playlistTitle, batchStamp);
      doneCount++;
      onResolveProgress?.(doneCount, total);
    }
  }

  const n = Math.min(6, total);
  await Promise.all(Array.from({ length: n }, () => worker()));

  onResolveProgress?.(total, total);
  return slots.filter((t): t is Track => t !== null);
}

async function buildSpotifyTrack(
  s: SpotifyTrackInfo,
  i: number,
  playlistTitle: string,
  batchStamp: string
): Promise<Track> {
  const title = String(s.title || "Untitled Track").trim();
  const artist = String(s.artist || "Unknown Artist").trim();
  const sourceTrackId = spotifyTrackId(s.spotifyUri);
  const spotifyUrl = s.spotifyUri
    ? sourceTrackId
      ? `https://open.spotify.com/track/${sourceTrackId}`
      : `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`
    : undefined;

  const resolved = await resolvePlayableSource({
    title,
    artist,
    artists: splitArtists(artist),
    album: playlistTitle,
    duration: s.duration,
    sourceTrackId,
  });

  const videoId = resolved.videoId || "";
  const perSongArt = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : s.cover;

  return {
    id: `sp-${batchStamp}-${i}`,
    videoId,
    title,
    artist,
    artists: splitArtists(artist),
    album: playlistTitle,
    duration: s.duration,
    thumb: perSongArt,
    artwork: perSongArt,
    coverUrl: perSongArt,
    sourceType: "spotify",
    sourcePlatform: "spotify",
    sourceUrl: spotifyUrl || s.spotifyUri,
    sourceTrackId,
    source: "custom",
    tag: `Spotify · ${playlistTitle.slice(0, 18)}`,
    playlistPosition: i + 1,
    seed: i + 1,
    addedAt: Date.now(),
    metadataConfidence: resolved.metadataConfidence,
    playable: Boolean(videoId),
    playableSource: videoId || undefined,
    playableSourceType: resolved.playableSourceType,
    resolverStatus: resolved.status,
  };
}