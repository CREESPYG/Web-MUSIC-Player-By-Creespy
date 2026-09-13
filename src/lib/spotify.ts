import type { Track } from "./media";
import { loadYouTubeAPI } from "./youtube";

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
      const r = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${type}/${id}`)}`
      );
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

/**
 * Searches YouTube for a matching track (Title + Artist) using the hidden YouTube API cuePlaylist search.
 * Zero CORS restrictions, 100% official YouTube client-side engine.
 */
export async function matchTrackToYouTube(
  title: string,
  artist: string
): Promise<string | null> {
  const query = `${artist} - ${title} audio`.trim();

  // Strategy 1: Hidden YouTube player cuePlaylist(search)
  try {
    const vid = await searchViaHiddenPlayer(query);
    if (vid) return vid;
  } catch {
    /* fallback */
  }

  // Strategy 2: Open CORS search endpoints
  const eps = [
    `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`,
    `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    `https://yewtu.be/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
  ];

  for (const ep of eps) {
    try {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(ep, { signal: ctrl.signal });
      window.clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      const items = j.items || (Array.isArray(j) ? j : []);
      if (items.length > 0) {
        const id = items[0].videoId || (items[0].url ? items[0].url.replace("/watch?v=", "") : null);
        if (id && typeof id === "string" && id.length === 11) return id;
      }
    } catch {
      /* continue */
    }
  }

  return null;
}

/**
 * Executes a client-side search via YouTube IFrame API's cuePlaylist { listType: 'search' }.
 */
function searchViaHiddenPlayer(query: string): Promise<string | null> {
  return new Promise(async (resolve) => {
    try {
      const YT = await loadYouTubeAPI();
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0.001;pointer-events:none;";
      document.body.appendChild(host);

      let resolved = false;
      const cleanup = (player?: any) => {
        try {
          player?.destroy?.();
        } catch {
          /* noop */
        }
        host.remove();
      };

      const timer = window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup(p);
          resolve(null);
        }
      }, 7000);

      let p: any = null;
      p = new YT.Player(host, {
        width: "10",
        height: "10",
        playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
        events: {
          onReady: (e: any) => {
            try {
              e.target.cuePlaylist({
                listType: "search",
                list: query,
                index: 0,
              });
            } catch {
              if (!resolved) {
                resolved = true;
                window.clearTimeout(timer);
                cleanup(p);
                resolve(null);
              }
            }
          },
          onStateChange: (e: any) => {
            // CUED is 5
            if (e.data === 5 && !resolved) {
              resolved = true;
              window.clearTimeout(timer);
              try {
                const list = e.target.getPlaylist() || [];
                cleanup(p);
                resolve(list.length > 0 ? list[0] : null);
              } catch {
                cleanup(p);
                resolve(null);
              }
            }
          },
          onError: () => {
            if (!resolved) {
              resolved = true;
              window.clearTimeout(timer);
              cleanup(p);
              resolve(null);
            }
          },
        },
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Converts SpotifyTrackInfo items to playable Track objects.
 * Immediately resolves the first few tracks to YouTube video IDs,
 * while leaving remaining tracks ready with their metadata and cover art.
 */
export async function convertSpotifyTracksToPlayerTracks(
  spotifyTracks: SpotifyTrackInfo[],
  playlistTitle: string,
  onResolveProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const tracks: Track[] = [];
  const total = spotifyTracks.length;

  for (let i = 0; i < spotifyTracks.length; i++) {
    const s = spotifyTracks[i];
    onResolveProgress?.(i, total);

    // Pre-resolve the first 3 tracks so user can play immediately without waiting
    let resolvedVideoId: string | null = null;
    if (i < 3) {
      try {
        resolvedVideoId = await matchTrackToYouTube(s.title, s.artist);
      } catch {
        /* fallback */
      }
    }

    // Fallback or placeholder video ID if search hasn't run yet
    const videoId = resolvedVideoId || `sp_${encodeURIComponent(s.title).slice(0, 7)}_${i}`;

    const trk: Track = {
      id: `sp-${Date.now()}-${i}`,
      videoId,
      title: s.title,
      artist: s.artist,
      album: playlistTitle,
      duration: s.duration || 180,
      thumb: s.cover || `https://i.ytimg.com/vi/${resolvedVideoId || "dQw4w9WgXcQ"}/maxresdefault.jpg`,
      artwork: s.cover,
      coverUrl: s.cover,
      sourceType: "spotify",
      sourceUrl: s.spotifyUri || `https://open.spotify.com/search/${encodeURIComponent(`${s.artist} ${s.title}`)}`,
      source: "custom",
      tag: `Spotify · ${playlistTitle.slice(0, 18)}`,
      bpm: 100,
      seed: i + 1,
      addedAt: Date.now(),
    };

    tracks.push(trk);
  }

  onResolveProgress?.(total, total);
  return tracks;
}
