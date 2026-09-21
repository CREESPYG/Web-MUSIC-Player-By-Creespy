import { loadYouTubeAPI } from "./youtube";
import { makeTrack, type Track } from "./media";

const PLAYLIST_FALLBACK_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.f5.si",
  "https://yewtu.be",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
];

/**
 * Loads all tracks from a YouTube playlist link/ID.
 * Strategy 1: Hidden YouTube IFrame cuePlaylist — works completely client-side with no CORS limits.
 * Strategy 2: Invidious/Piped public playlist endpoint as a fast fall-through.
 */
export async function loadYouTubePlaylist(
  playlistId: string,
  onProgress?: (loaded: number, total?: number) => void
): Promise<Track[]> {
  // Try YouTube IFrame API first (reliable, official iframe engine already present)
  try {
    const fromIframe = await loadPlaylistViaIframe(playlistId, onProgress);
    if (fromIframe && fromIframe.length > 0) return fromIframe;
  } catch {
    /* fallback to REST */
  }

  // Strategy 2: REST fallback
  for (const base of PLAYLIST_FALLBACK_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), 6000);
      const url = base.includes("piped")
        ? `${base}/playlists/${playlistId}`
        : `${base}/api/v1/playlists/${playlistId}`;
      const res = await fetch(url, { signal: ctrl.signal });
      window.clearTimeout(to);
      if (!res.ok) continue;
      const j = await res.json();
      const rawVideos: any[] = base.includes("piped") ? j?.relatedStreams || [] : j?.videos || [];
      const out: Track[] = [];
      for (const v of rawVideos) {
        const vid = base.includes("piped") ? v?.url?.replace("/watch?v=", "") : v?.videoId;
        if (!vid || typeof vid !== "string" || vid.length !== 11) continue;
        const title = (v.title || `Track ${out.length + 1}`).slice(0, 80);
        const artist = (base.includes("piped") ? v.uploaderName : v.author || "YouTube Playlist").slice(0, 40);
        const dur = typeof v.lengthSeconds === "number" ? v.lengthSeconds : typeof v.duration === "number" ? v.duration : undefined;
        out.push(makeTrack(vid, title, artist, j.title ? `Playlist · ${String(j.title).slice(0, 24)}` : "Playlist", "custom", dur));
      }
      if (out.length > 0) return out;
    } catch {
      /* continue */
    }
  }

  throw new Error("Could not extract tracks from playlist");
}

import { fetchTrackMeta } from "./media";

async function resolveYouTubePlaylistTracks(
  ids: string[],
  playlistId: string,
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const total = ids.length;
  const tracks: Track[] = new Array(total);
  let done = 0;

  onProgress?.(0, total);

  // Concurrency pool of 6
  const concurrency = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < total) {
      const idx = cursor++;
      const vid = ids[idx];
      try {
        const meta = await fetchTrackMeta(vid);
        const title = meta.title && meta.title.trim() ? meta.title : `Track ${idx + 1}`;
        const artist = meta.artist && meta.artist.trim() ? meta.artist : "YouTube Artist";
        tracks[idx] = makeTrack(
          vid,
          title,
          artist,
          `Playlist · ${playlistId.slice(0, 8)}`,
          "custom",
          meta.duration
        );
      } catch {
        tracks[idx] = makeTrack(
          vid,
          `Track ${idx + 1}`,
          "YouTube",
          `Playlist · ${playlistId.slice(0, 8)}`,
          "custom"
        );
      }
      done++;
      onProgress?.(done, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return tracks.filter(Boolean);
}

function loadPlaylistViaIframe(
  playlistId: string,
  onProgress?: (loaded: number, total?: number) => void
): Promise<Track[]> {
  return new Promise(async (resolve, reject) => {
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
        reject(new Error("Timeout loading playlist"));
      }
    }, 15000);

    let p: any = null;
    p = new YT.Player(host, {
      width: "10",
      height: "10",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
      },
      events: {
        onReady: (e: any) => {
          try {
            e.target.cuePlaylist({
              listType: "playlist",
              list: playlistId,
              index: 0,
            });
          } catch (err) {
            if (!resolved) {
              resolved = true;
              window.clearTimeout(timer);
              cleanup(p);
              reject(err);
            }
          }
        },
        onStateChange: async (e: any) => {
          // YT.PlayerState.CUED is 5
          if (e.data === 5 && !resolved) {
            resolved = true;
            window.clearTimeout(timer);
            try {
              const ids: string[] = e.target.getPlaylist() || [];
              if (!ids.length) {
                cleanup(p);
                return resolve([]);
              }
              const tracks = await resolveYouTubePlaylistTracks(ids, playlistId, onProgress);
              cleanup(p);
              resolve(tracks);
            } catch (err) {
              cleanup(p);
              reject(err);
            }
          }
        },
        onError: (err: any) => {
          if (!resolved) {
            resolved = true;
            window.clearTimeout(timer);
            cleanup(p);
            reject(err);
          }
        },
      },
    });
  });
}
