import { isSpotifyUrl, loadSpotifyData, convertSpotifyTracksToPlayerTracks } from "./spotify";
import { isJioSaavnUrl, loadJioSaavnResource, convertJioSaavnTracksToPlayerTracks } from "./jiosaavn";
import { isSoundCloudUrl, loadSoundCloudTrack, convertSoundCloudTrackToPlayerTrack } from "./soundcloud";
import type { Track } from "./trackModel";

/**
 * Phase 12 — Future Source Adapters.
 *
 * A declarative plug-in point so new music sources can be integrated WITHOUT
 * touching the core import flow: pick a SourceName, implement `canHandle` +
 * `load` (returning already-normalized player Tracks with sourcePlatform /
 * sourceTrackId preserved), and call `registerSourceAdapter(...)`.
 *
 * The built-in Spotify / JioSaavn / SoundCloud importers are provided as
 * adapters, and PlaylistsView dispatches through `resolveSourceAdapter`.
 */
export type SourceName = "spotify" | "jiosaavn" | "soundcloud";

export interface AdapterLoadResult {
  name: SourceName;
  title?: string;
  cover?: string;
  tracks: Track[];
}

export interface SourceAdapter {
  name: SourceName;
  canHandle(url: string): boolean;
  /** Returns normalized player tracks, or `null` when nothing was loadable. */
  load(url: string, onStatus: (msg: string) => void, playlistTitle: string): Promise<AdapterLoadResult | null>;
}

const adapters = new Map<SourceName, SourceAdapter>();

const spotifyAdapter: SourceAdapter = {
  name: "spotify",
  canHandle: (url) => isSpotifyUrl(url),
  load: async (url, onStatus, playlistTitle) => {
    onStatus("Fetching Spotify metadata & tracks...");
    const spData = await loadSpotifyData(url, (done, total) => {
      onStatus(`Loading Spotify tracks ${done}/${total}...`);
    });
    if (!spData.tracks.length) return null;
    onStatus(`Matching ${spData.tracks.length} songs to audio streams...`);
    const tracks = await convertSpotifyTracksToPlayerTracks(spData.tracks, playlistTitle, (done, total) => {
      onStatus(`Matching ${done}/${total} audio streams...`);
    });
    if (!tracks.length) return null;
    return { name: "spotify", title: spData.title, cover: spData.cover, tracks };
  },
};

const jiosaavnAdapter: SourceAdapter = {
  name: "jiosaavn",
  canHandle: (url) => isJioSaavnUrl(url),
  load: async (url, onStatus, playlistTitle) => {
    onStatus("Fetching JioSaavn tracks...");
    const jsResult = await loadJioSaavnResource(url, (done) => {
      onStatus(`Loading JioSaavn tracks ${done}...`);
    });
    if (!jsResult.items.length) return null;
    onStatus(`Matching ${jsResult.items.length} songs to audio streams...`);
    const tracks = await convertJioSaavnTracksToPlayerTracks(jsResult, playlistTitle, (done, total) => {
      onStatus(`Matching audio streams: ${done}/${total}...`);
    });
    if (!tracks.length) return null;
    return { name: "jiosaavn", title: jsResult.title, cover: jsResult.cover, tracks };
  },
};

const soundcloudAdapter: SourceAdapter = {
  name: "soundcloud",
  canHandle: (url) => isSoundCloudUrl(url),
  load: async (url, onStatus, playlistTitle) => {
    onStatus("Fetching SoundCloud track...");
    const scInfo = await loadSoundCloudTrack(url, (done, total) => {
      onStatus(`Fetching SoundCloud track ${done}/${total}...`);
    });
    onStatus(`Matching "${scInfo.title.slice(0, 24)}" to audio stream...`);
    const track = await convertSoundCloudTrackToPlayerTrack(scInfo, playlistTitle);
    if (!track) return null;
    return { name: "soundcloud", title: scInfo.title, cover: track.thumb, tracks: [track] };
  },
};

[spotifyAdapter, jiosaavnAdapter, soundcloudAdapter].forEach((a) => adapters.set(a.name, a));

/** Adapter whose `canHandle` accepts the given URL, or `null`. */
export function resolveSourceAdapter(url: string): SourceAdapter | null {
  for (const a of adapters.values()) {
    if (a.canHandle(url)) return a;
  }
  return null;
}

/** Phase 12 plug-in point — register a future source adapter. */
export function registerSourceAdapter(adapter: SourceAdapter): void {
  adapters.set(adapter.name, adapter);
}

/** Resolve + load through one adapter; returns `null` when unhandled/empty. */
export async function loadViaAdapter(
  url: string,
  playlistTitle: string,
  onStatus: (msg: string) => void
): Promise<AdapterLoadResult | null> {
  const adapter = resolveSourceAdapter(url);
  if (!adapter) return null;
  return adapter.load(url, onStatus, playlistTitle);
}

export { spotifyAdapter, jiosaavnAdapter, soundcloudAdapter };