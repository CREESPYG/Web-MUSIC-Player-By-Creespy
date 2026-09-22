export type TrackSourceType = "youtube" | "youtube-music" | "spotify" | "itunes" | "jiosaavn" | "soundcloud" | "custom";

export type ResolverStatus = "EXACT" | "HIGH" | "MEDIUM" | "LOW" | "UNRESOLVED";

export interface Track {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
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
  sourcePlatform?: string;
  sourceUrl?: string;
  sourceTrackId?: string;
  genre?: string;
  tags?: string[];
  addedAt?: number;
  metadataConfidence?: ResolverStatus;
  playlistPosition?: number;
  isrc?: string;
  artists?: string[];
  playable?: boolean;
  playableSource?: string;
  playableSourceType?: "youtube";
  resolverStatus?: ResolverStatus;
}

/**
 * Normalizes any track object to the standardized CREESPY Track model.
 *
 * Original platform identity (sourceType / sourcePlatform / sourceUrl /
 * sourceTrackId / isrc) and version-bearing metadata are ALWAYS preserved.
 * `videoId` may be absent when a track is imported but has no playable source
 * yet (resolverStatus === "UNRESOLVED") — those tracks stay in the playlist.
 */
export function normalizeTrack(raw: Partial<Track> & { id: string }): Track {
  const sourceThumb = raw.thumb || raw.coverUrl || raw.artwork || "";
  const highResThumb = sourceThumb
    .replace("hqdefault.jpg", "maxresdefault.jpg")
    .replace("100x100bb.jpg", "600x600bb.jpg");

  const finalThumb =
    highResThumb || (raw.videoId ? `https://i.ytimg.com/vi/${raw.videoId}/hqdefault.jpg` : "");

  const isPlayable = Boolean(raw.videoId) && raw.resolverStatus !== "LOW" && raw.resolverStatus !== "UNRESOLVED";

  return {
    id: raw.id,
    videoId: raw.videoId || "",
    title: raw.title?.trim() || "Untitled Track",
    artist: raw.artist?.trim() || "Unknown Artist",
    artists: Array.isArray(raw.artists) && raw.artists.length ? raw.artists : raw.artist ? [raw.artist] : undefined,
    album: raw.album?.trim() || undefined,
    albumArtist: raw.albumArtist?.trim() || undefined,
    thumb: finalThumb || undefined,
    coverUrl: finalThumb || undefined,
    artwork: finalThumb || undefined,
    duration: typeof raw.duration === "number" ? raw.duration : undefined,
    bpm: raw.bpm || 96,
    seed: raw.seed || 1,
    tag: raw.tag || "Import",
    source: raw.source || "custom",
    sourceType: raw.sourceType || "custom",
    sourcePlatform: raw.sourcePlatform || raw.sourceType || "custom",
    sourceUrl: raw.sourceUrl || (raw.videoId ? `https://www.youtube.com/watch?v=${raw.videoId}` : undefined),
    sourceTrackId: raw.sourceTrackId,
    genre: raw.genre,
    tags: raw.tags || [],
    addedAt: raw.addedAt || Date.now(),
    metadataConfidence: raw.metadataConfidence,
    playlistPosition: raw.playlistPosition,
    isrc: raw.isrc,
    playable: raw.playable ?? isPlayable,
    playableSource: raw.playableSource || raw.videoId,
    playableSourceType: raw.playableSourceType || (raw.videoId ? "youtube" : undefined),
    resolverStatus: raw.resolverStatus || (raw.videoId ? "EXACT" : "UNRESOLVED"),
  };
}
