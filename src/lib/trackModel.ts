export type TrackSourceType = "youtube" | "spotify" | "itunes" | "custom";

export interface Track {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumb?: string;
  coverUrl?: string;
  artwork?: string;
  duration?: number;
  bpm?: number;
  seed?: number;
  tag?: string;
  custom?: boolean;
  source?: "seed" | "custom" | "similar" | string;
  sourceType?: TrackSourceType;
  sourceUrl?: string;
  genre?: string;
  tags?: string[];
  addedAt?: number;
}

/**
 * Normalizes any track object to a standardized Track model
 */
export function normalizeTrack(raw: Partial<Track> & { videoId: string }): Track {
  const highResThumb = (raw.thumb || raw.coverUrl || raw.artwork || "")
    .replace("hqdefault.jpg", "maxresdefault.jpg")
    .replace("100x100bb.jpg", "600x600bb.jpg");

  const finalThumb = highResThumb || `https://i.ytimg.com/vi/${raw.videoId}/hqdefault.jpg`;

  return {
    id: raw.id || raw.videoId,
    videoId: raw.videoId,
    title: raw.title?.trim() || "Untitled Track",
    artist: raw.artist?.trim() || "Unknown Artist",
    album: raw.album?.trim() || undefined,
    thumb: finalThumb,
    coverUrl: finalThumb,
    artwork: finalThumb,
    duration: typeof raw.duration === "number" ? raw.duration : 0,
    bpm: raw.bpm || 96,
    seed: raw.seed || 1,
    tag: raw.tag || "Ambient",
    source: raw.source || "custom",
    sourceType: raw.sourceType || "youtube",
    sourceUrl: raw.sourceUrl || `https://www.youtube.com/watch?v=${raw.videoId}`,
    genre: raw.genre,
    tags: raw.tags || [],
    addedAt: raw.addedAt || Date.now(),
  };
}
