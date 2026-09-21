import { loadYouTubeAPI } from "./youtube";
import { fetchTrackMeta, makeTrack, type Track } from "./media";

const PLAYLIST_FALLBACK_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.f5.si",
  "https://yewtu.be",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
];

const PAGE_TIMEOUT_MS = 6000;
const META_CONCURRENCY = 6;

// Circuit breaker: avoid hammering dead/blocked instances for a few minutes.
const instanceFailures = new Map<string, number>();
const FAIL_COOLDOWN_MS = 300_000;

function instanceHealthy(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    const lastFail = instanceFailures.get(host) || 0;
    return Date.now() - lastFail > FAIL_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markInstanceFailed(base: string): void {
  try {
    instanceFailures.set(new URL(base).hostname, Date.now());
  } catch {
    /* noop */
  }
}

/**
 * Loads all tracks from a YouTube playlist link/ID with real pagination.
 *
 * Strategy 1 (primary): Invidious / Piped public playlist endpoints, paging
 *   through every page (Invidious `page`, Piped `nextpage`) until the playlist
 *   is exhausted — no 200-track cap, no arbitrary limit.
 * Strategy 2 (fallback): hidden YouTube IFrame cuePlaylist, used only when every
 *   REST instance fails. Caveat: the IFrame engine only loads the first ~200
 *   entries of a playlist; it is a last resort, not the primary path.
 */
export async function loadYouTubePlaylist(
  playlistId: string,
  onProgress?: (loaded: number, total?: number) => void
): Promise<Track[]> {
  const rest = await loadPlaylistViaREST(playlistId, onProgress);
  if (rest.length > 0) return rest;

  try {
    const fromIframe = await loadPlaylistViaIframe(playlistId, onProgress);
    if (fromIframe && fromIframe.length > 0) return fromIframe;
  } catch {
    /* fall through */
  }

  throw new Error("Could not extract tracks from playlist");
}

async function loadPlaylistViaREST(
  playlistId: string,
  onProgress?: (loaded: number, total?: number) => void
): Promise<Track[]> {
  for (const base of PLAYLIST_FALLBACK_INSTANCES) {
    if (!instanceHealthy(base)) continue;
    try {
      const tracks = await fetchAllPagesFromInstance(base, playlistId, onProgress);
      if (tracks.length > 0) return tracks;
    } catch {
      markInstanceFailed(base);
    }
  }
  return [];
}

/** Walks every page of one Invidious or Piped instance until the playlist ends. */
async function fetchAllPagesFromInstance(
  base: string,
  playlistId: string,
  onProgress?: (loaded: number, total?: number) => void
): Promise<Track[]> {
  const isPiped = base.includes("piped");
  const out: Track[] = [];
  const seen = new Set<string>();
  const seenNext = new Set<string>();
  let pageNo = 0;
  let nextToken: string | null = null;
  let total: number | null = null;
  let playlistName: string | null = null;

  for (;;) {
    pageNo++;
    let url: string;
    if (isPiped) {
      url = `${base}/playlists/${playlistId}`;
      if (nextToken) url += `?nextpage=${encodeURIComponent(nextToken)}`;
    } else {
      url = `${base}/api/v1/playlists/${playlistId}?page=${pageNo}`;
    }

    const j = await fetchJson(url);
    if (!j) {
      if (pageNo === 1) throw new Error("instance unreachable");
      break;
    }

    const rawVideos: any[] = isPiped ? j?.relatedStreams || [] : j?.videos || [];
    if (rawVideos.length === 0) break;
    if (total === null && !isPiped && typeof j?.videoCount === "number") total = j.videoCount;
    if (!playlistName) playlistName = j?.title || j?.name || null;

    const added: Track[] = [];
    for (const v of rawVideos) {
      const vid = isPiped ? String(v?.url || "").replace("/watch?v=", "") : v?.videoId;
      if (!vid || typeof vid !== "string" || vid.length !== 11) continue;
      if (seen.has(vid)) continue;
      const title = String(v.title || `Track ${out.length + added.length + 1}`).slice(0, 80);
      const artist = String(
        isPiped ? v.uploaderName : v.author || "YouTube Playlist"
      ).slice(0, 40);
      const dur =
        isPiped && typeof v.duration === "number"
          ? v.duration
          : !isPiped && typeof v.lengthSeconds === "number"
            ? v.lengthSeconds
            : undefined;
      seen.add(vid);
      added.push(
        makeTrack(
          vid,
          title,
          artist,
          playlistName ? `Playlist · ${playlistName.slice(0, 24)}` : "Playlist",
          "custom",
          dur
        )
      );
    }
    // Stop when a page adds nothing new: either the real final page or a
    // repeated/empty page from a misbehaving instance. No arbitrary cap.
    if (added.length === 0) break;
    out.push(...added);
    onProgress?.(out.length, total ?? undefined);

    if (isPiped) {
      const np = j?.nextpage;
      if (!np || np === "NEXTPAGE_END" || seenNext.has(String(np))) break;
      seenNext.add(String(np));
      nextToken = String(np);
    }
  }
  return out;
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(to);
  }
}

async function resolveYouTubePlaylistTracks(
  ids: string[],
  playlistId: string,
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const total = ids.length;
  const tracks: Track[] = new Array(total);
  let done = 0;

  onProgress?.(0, total);

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

  const workers = Array.from({ length: Math.min(META_CONCURRENCY, total) }, () => worker());
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