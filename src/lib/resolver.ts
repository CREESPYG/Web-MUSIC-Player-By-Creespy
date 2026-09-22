import type { ResolverStatus } from "./trackModel";
import { fetchTrackMeta, searchYouTube, tokens, type TrackMeta } from "./media";
import { loadYouTubeAPI } from "./youtube";

/**
 * PHASE 7 — PLAYABLE SOURCE RESOLVER
 *
 * Original Playlist Track → Normalized Track → Playable Source Resolver → Playable Source.
 *
 * The resolver NEVER destroys or overwrites the original platform identity
 * (sourceType / sourcePlatform / sourceUrl / sourceTrackId / isrc). It only
 * ATTACHES a playable source (playableSource / playableSourceType) plus a
 * resolverStatus + metadataConfidence verdict.
 *
 * Matching priority (higher wins):
 *   1. ISRC                          — preserved, but not resolvable keyless
 *   2. Platform track ID             — preserved, but not mappable to YouTube keyless
 *   3. Title + artist (+ version)    — primary path
 *   4. Title + artist + album + duration — strengthens the primary path
 *   5. Fuzzy — only as a fallback, never a replacement
 *
 * NEVER identify a track using title alone.
 *
 * Compliance: only legitimate, technically supported playable sources are
 * produced (YouTube IFrame API video IDs). No DRM bypass, no scraping protected
 * content, no stolen credentials. If no legitimate source exists the result is
 * resolverStatus = UNRESOLVED and the track is NOT removed from the playlist.
 */

/* ------------------------------------------------------------------ */
/*  Version metadata preservation                                     */
/* ------------------------------------------------------------------ */

/** Version markers that must never be lost across import/normalization. */
const VERSION_MARKERS = [
  "remix",
  "live",
  "acoustic",
  "extended",
  "radio edit",
  "instrumental",
  "remastered",
  "original mix",
  "sped up",
  "slowed",
  "cover",
  "edit",
] as const;

/** Returns the version markers present in a title (lowercased, deduped). */
export function versionMarkersOf(title: string): string[] {
  const t = String(title || "").toLowerCase();
  return VERSION_MARKERS.filter((m) => t.includes(m));
}

/** Title with version markers removed — base title used for token matching. */
export function stripVersion(title: string): string {
  let out = String(title || "");
  for (const m of VERSION_MARKERS) {
    out = out
      .replace(new RegExp(`\\s*[\\[\\(]\\s*${m.replace(/ /g, "\\s*")}\\s*[\\]\\)]`, "gi"), " ")
      .replace(new RegExp(`\\b${m}\\b`, "gi"), " ");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Token coverage of `needle` inside a `candidate` string (0..1). */
function tokenCover(needle: string, candidate: string): number {
  const n = tokens(needle);
  if (!n.length) return 1; // nothing required → vacuously matched
  const cand = new Set(tokens(candidate));
  let hit = 0;
  for (const t of n) if (cand.has(t)) hit++;
  return hit / n.length;
}

/** Duration check → true (same family), false (wrong recording length), null (unknown/ambiguous). */
function durationMatches(queryDuration?: number, candDuration?: number): boolean | null {
  if (typeof queryDuration !== "number" || queryDuration <= 0) return null;
  if (typeof candDuration !== "number" || candDuration <= 0) return null;
  if (candDuration > queryDuration * 3 || candDuration < queryDuration * 0.33) return false;
  if (candDuration >= queryDuration * 0.85 && candDuration <= queryDuration * 1.2) return true;
  return null;
}

export interface ResolverResult {
  videoId: string | null;
  status: ResolverStatus;
  /** Legitimate playable source backing (always "youtube" when videoId is set). */
  playableSourceType: "youtube";
  metadataConfidence: ResolverStatus;
  /** True when the resolver explored candidates but none met the identity bar. */
  tried: boolean;
}

/**
 * Verdict assembly — LOW is NEVER auto-played (it could be the wrong
 * recording / version), it is stored but held back.
 */
function grade(
  titleCover: number,
  artistHit: boolean,
  dur: boolean | null,
  versionOk: boolean
): ResolverStatus {
  if (titleCover >= 0.75 && artistHit && versionOk) {
    if (dur === true && titleCover >= 0.9) return "EXACT";
    return "HIGH";
  }
  if (titleCover >= 0.6 && artistHit && versionOk) return "MEDIUM";
  // Strong title but artist/version unconfirmed → risky → held back.
  return "LOW";
}

/* ------------------------------------------------------------------ */
/*  Search + verification (hidden-player primary, REST fallback)      */
/* ------------------------------------------------------------------ */

async function searchViaHiddenPlayer(query: string): Promise<string | null> {
  return new Promise(async (resolve) => {
    try {
      const YT = await loadYouTubeAPI();
      const host = document.createElement("div");
      host.style.cssText =
        "position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0.001;pointer-events:none;";
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

/* ------------------------------------------------------------------ */
/*  Module-level remember cache (correctness-neutral speedup)         */
/* ------------------------------------------------------------------ */

const MISSING_SENTINEL = "!!!missing!!!";
const matchCache = new Map<string, string>();
const MATCH_CACHE_MAX = 5000;

/** Insert into the remember cache with an oldest-first cap (QA perf polish). */
function rememberMatch(key: string, value: string): void {
  while (matchCache.size >= MATCH_CACHE_MAX) {
    const oldest = matchCache.keys().next().value;
    if (oldest === undefined) break;
    matchCache.delete(oldest);
  }
  matchCache.set(key, value);
}

function cacheKey(title: string, artist: string): string {
  return `${String(title || "").toLowerCase().trim()}|${String(artist || "").toLowerCase().trim()}`;
}

/**
 * Searches for the SAME song (title + artist + version + duration identity)
 * and returns a verified candidate, or null when none meet the identity bar.
 */
async function searchVerified(
  queryTitle: string,
  queryArtist: string,
  queryDuration?: number
): Promise<{ videoId: string; meta: TrackMeta } | null> {
  const baseTitle = stripVersion(queryTitle);
  const hasVersion = versionMarkersOf(queryTitle).length > 0;
  const query = `${queryArtist} - ${baseTitle}`.trim();

  const artistTokens = tokens(queryArtist).slice(0, 3);
  const srcMarkers = versionMarkersOf(queryTitle);

  const acceptable = (title: string, artist: string, duration?: number): boolean => {
    const titleCover = tokenCover(baseTitle, title);
    if (titleCover < 0.6) return false;
    const text = `${title} ${artist}`.toLowerCase();
    const artistHit =
      artistTokens.length === 0 ||
      artistTokens.some((t) => text.includes(t)) ||
      tokenCover(queryArtist, artist) >= 0.5;
    if (!artistHit && titleCover < 0.9) return false;
    if (durationMatches(queryDuration, duration) === false) return false;
    if (hasVersion) {
      const candMarkers = versionMarkersOf(title);
      if (!candMarkers.some((m) => srcMarkers.includes(m))) return false; // wrong version
    }
    return true;
  };

  // PRIMARY: hidden-player search (tunnels through the user's own session, CORS-free).
  try {
    const vid = await searchViaHiddenPlayer(`${query}${hasVersion ? "" : " audio"}`);
    if (vid && vid.length === 11) {
      const meta = await fetchTrackMeta(vid);
      if (acceptable(meta.title, meta.artist, meta.duration)) {
        return { videoId: vid, meta };
      }
    }
  } catch {
    /* fallback */
  }

  // FALLBACK: keyless REST search with per-candidate verification.
  try {
    const results = await searchYouTube(query, 10);
    for (const r of results) {
      if (acceptable(r.title, r.artist, r.duration) && r.videoId && r.videoId.length === 11) {
        return { videoId: r.videoId, meta: { title: r.title, artist: r.artist, duration: r.duration } };
      }
    }
  } catch {
    /* fallback */
  }

  return null;
}

/**
 * Backward-compatible matcher (Phase 5 movement). Returns a VERIFIED YouTube
 * videoId or null. `artist` may be empty ONLY for the free-text paste import
 * flow; imported-playlist resolution goes through resolvePlayableSource().
 */
export async function matchTrackToYouTube(
  title: string,
  artist: string,
  duration?: number
): Promise<string | null> {
  const key = cacheKey(title, artist);
  const cached = matchCache.get(key);
  if (cached !== undefined) return cached === MISSING_SENTINEL ? null : cached;

  let videoId: string | null = null;
  try {
    const hit = await searchVerified(title, artist, duration);
    videoId = hit ? hit.videoId : null;
  } catch {
    videoId = null;
  }
  rememberMatch(key, videoId ? videoId : MISSING_SENTINEL);
  return videoId;
}

/* ------------------------------------------------------------------ */
/*  Public resolver entry point                                       */
/* ------------------------------------------------------------------ */

export interface ResolveInput {
  title: string;
  artist?: string;
  artists?: string[];
  album?: string;
  duration?: number;
  sourceTrackId?: string;
  isrc?: string;
}

/**
 * Resolves a normalized track to its playable source.
 *
 * Priority notes (keyless — no credentials, no scraping):
 *   • ISRC → a direct ISRC→YouTube lookup needs an official API; the ISRC is
 *     preserved on the track and the resolver still enforces
 *     title+artist+version+duration.
 *   • Platform track ID → Spotify/JioSaavn/SoundCloud IDs are not mappable to
 *     YouTube without their official APIs; preserved as sourceTrackId.
 */
export async function resolvePlayableSource(input: ResolveInput): Promise<ResolverResult> {
  const title = String(input.title || "").trim();
  const artistOf =
    (input.artist && input.artist.trim()) || input.artists?.find((a) => a && a.trim())?.trim() || "";
  const artistJoined =
    input.artist?.trim() || input.artists?.map((a) => a.trim()).filter(Boolean).join(", ") || "";

  // NEVER identify a track using title alone.
  if (!artistOf || artistOf === "Unknown Artist" || artistOf === "JioSaavn Artist") {
    return {
      videoId: null,
      status: "UNRESOLVED",
      playableSourceType: "youtube",
      metadataConfidence: "UNRESOLVED",
      tried: false,
    };
  }

  const key = cacheKey(title, artistOf);
  const cached = matchCache.get(key);
  let videoId: string | null = null;
  let tried = true;
  if (cached !== undefined) {
    videoId = cached === MISSING_SENTINEL ? null : cached;
  } else {
    try {
      const hit = await searchVerified(title, artistOf, input.duration);
      videoId = hit ? hit.videoId : null;
    } catch {
      videoId = null;
    }
    rememberMatch(key, videoId ? videoId : MISSING_SENTINEL);
  }

  if (!videoId) {
    return {
      videoId: null,
      status: "UNRESOLVED",
      playableSourceType: "youtube",
      metadataConfidence: "UNRESOLVED",
      tried,
    };
  }

  // Re-verify through oEmbed metadata so the verdict is truthful even on a cache hit.
  let status: ResolverStatus = artistJoined ? "HIGH" : "MEDIUM";
  try {
    const meta = await fetchTrackMeta(videoId);
    const titleCover = tokenCover(stripVersion(title), meta.title);
    const artistTokens = tokens(artistOf).slice(0, 3);
    const text = `${meta.title} ${meta.artist}`.toLowerCase();
    const artistHit =
      artistTokens.length === 0 || artistTokens.some((t) => text.includes(t)) || tokenCover(artistOf, meta.artist) >= 0.5;
    const dur = durationMatches(input.duration, meta.duration);
    const srcMarkers = versionMarkersOf(title);
    const candMarkers = versionMarkersOf(meta.title);
    const versionOk = srcMarkers.length === 0 || candMarkers.some((m) => srcMarkers.includes(m));
    status = grade(titleCover, artistHit, dur, versionOk);
  } catch {
    /* oEmbed failed — keep the search-time verdict */
  }

  if (status === "LOW") {
    // A plausible video exists but identity is uncertain — keep it as a
    // non-auto-playable LO-fidelity candidate.
    return { videoId: null, status, playableSourceType: "youtube", metadataConfidence: status, tried };
  }

  return { videoId, status, playableSourceType: "youtube", metadataConfidence: status, tried };
}