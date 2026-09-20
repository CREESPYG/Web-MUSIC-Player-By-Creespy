/**
 * LRCLIB Integration for Synchronized & Plain Lyrics
 * ===================================================
 * Fetches time-synced or plain lyrics from LRCLIB (https://lrclib.net),
 * parses LRC timestamps, and provides clean metadata extraction from YouTube titles.
 */

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsData {
  id?: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
  lines: LyricLine[];
  isSynced: boolean;
}

// Memory cache for active session
const cache = new Map<string, LyricsData | null>();

/** Clean noisy YouTube titles and tags to extract genuine song title and artist */
export function cleanTrackMetadata(rawTitle: string, rawArtist?: string): { title: string; artist: string } {
  let title = rawTitle.trim();
  let artist = (rawArtist || "").trim();

  // If artist is generic like "CREESPY" or YouTube channel names with tags, check if title has "Artist - Song"
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      // e.g. "Queen - Bohemian Rhapsody"
      const candidateArtist = parts[0].trim();
      const candidateTitle = parts.slice(1).join(" - ").trim();
      if (!artist || artist.toLowerCase() === "creespy" || artist.toLowerCase() === "unknown") {
        artist = candidateArtist;
      }
      title = candidateTitle;
    }
  }

  // Remove common YouTube tags & junk
  title = title
    .replace(/\[.*?\]|\(.*?\)/g, (match) => {
      if (/official|video|audio|lyrics|hd|4k|mv|music|remix|extended|mix|visualizer|live|acoustic/i.test(match)) {
        return "";
      }
      return match;
    })
    .replace(/ft\.?|feat\.?/gi, "")
    .replace(/\|\s*.*$/g, "") // remove "| Channel Name"
    .replace(/\s{2,}/g, " ")
    .trim();

  // Clean artist noise
  artist = artist
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .replace(/VEVO|Official|Topic/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { title, artist };
}

/** Parse LRC formatted text into structured lines */
export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return [];
  const lines: LyricLine[] = [];
  const rawLines = lrc.split("\n");

  const lrcRegex = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;

  for (const raw of rawLines) {
    const match = raw.match(lrcRegex);
    if (!match) continue;

    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const msStr = match[3] || "0";
    // If 2 digits, treat as hundredths of a sec; if 3 digits, ms
    const fraction = msStr.length === 3 ? parseInt(msStr, 10) / 1000 : parseInt(msStr, 10) / 100;
    const time = min * 60 + sec + fraction;
    const text = match[4].trim();

    lines.push({ time, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

/** Convert plain text lyrics into lines with evenly distributed approximate timestamps or null times */
export function parsePlainLyrics(plain: string): LyricLine[] {
  if (!plain) return [];
  return plain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ time: -1, text }));
}

/** Generate a consistent cache key */
function getCacheKey(title: string, artist?: string): string {
  return `${title.toLowerCase()}:::${(artist || "").toLowerCase()}`;
}

/**
 * Fetch lyrics from LRCLIB.
 * Strategy:
 * 1. Try exact /api/get with artist & track name
 * 2. Try /api/search with track_name & artist_name
 * 3. Try /api/search with freeform query
 */
export async function fetchLyrics(
  rawTitle: string,
  rawArtist?: string,
  durationSeconds?: number
): Promise<LyricsData | null> {
  const { title, artist } = cleanTrackMetadata(rawTitle, rawArtist);
  const cacheKey = getCacheKey(title, artist);

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null;
  }

  try {
    // 1. Try exact get if artist is present
    if (artist && title) {
      const params = new URLSearchParams({
        artist_name: artist,
        track_name: title,
      });
      if (durationSeconds && durationSeconds > 0) {
        params.set("duration", Math.round(durationSeconds).toString());
      }

      const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const parsed = processLrclibResponse(data, title, artist);
        if (parsed) {
          cache.set(cacheKey, parsed);
          return parsed;
        }
      }
    }

    // 2. Search by artist & track
    if (artist && title) {
      const searchParams = new URLSearchParams({
        track_name: title,
        artist_name: artist,
      });
      const res = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`);
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          // Prefer synced lyrics
          const best = results.find((r: any) => r.syncedLyrics) || results[0];
          const parsed = processLrclibResponse(best, title, artist);
          if (parsed) {
            cache.set(cacheKey, parsed);
            return parsed;
          }
        }
      }
    }

    // 3. Fallback: Freeform query
    const query = `${artist} ${title}`.trim() || title;
    const queryRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
    if (queryRes.ok) {
      const results = await queryRes.json();
      if (Array.isArray(results) && results.length > 0) {
        const best = results.find((r: any) => r.syncedLyrics) || results[0];
        const parsed = processLrclibResponse(best, title, artist);
        if (parsed) {
          cache.set(cacheKey, parsed);
          return parsed;
        }
      }
    }

    cache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.warn("Failed to fetch lyrics from LRCLIB:", err);
    return null;
  }
}

function processLrclibResponse(data: any, fallbackTitle: string, fallbackArtist: string): LyricsData | null {
  if (!data) return null;

  const isInstrumental = Boolean(data.instrumental);
  const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
  const plain = data.plainLyrics ? parsePlainLyrics(data.plainLyrics) : [];

  const lines = synced.length > 0 ? synced : plain;

  return {
    id: data.id,
    trackName: data.trackName || fallbackTitle,
    artistName: data.artistName || fallbackArtist,
    albumName: data.albumName,
    duration: data.duration,
    instrumental: isInstrumental,
    plainLyrics: data.plainLyrics,
    syncedLyrics: data.syncedLyrics,
    lines,
    isSynced: synced.length > 0,
  };
}

/** Given current playback time in seconds, finds index of current line in synced lyrics */
export function getActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (!lines || lines.length === 0 || currentTime < 0) return -1;

  // If before first line
  if (currentTime < lines[0].time) return -1;

  let activeIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }
  return activeIdx;
}
